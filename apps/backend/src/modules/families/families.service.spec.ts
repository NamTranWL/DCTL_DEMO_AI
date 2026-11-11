import { UserRole, UserStatus } from '@dctl/shared';
import { type EventEmitter2 } from '@nestjs/event-emitter';
import { type DataSource, type EntityManager } from 'typeorm';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCode } from '../../common/exceptions/error-code.enum';
import { User } from '../users/entities/user.entity';
import { type UserRepository } from '../users/repositories/user.repository';
import { Family } from './entities/family.entity';
import {
  FAMILY_CREATED,
  FAMILY_DISSOLVED,
  FAMILY_MEMBER_JOINED,
  FAMILY_MEMBER_LEFT,
  FAMILY_MEMBER_REMOVED,
  FAMILY_OWNERSHIP_TRANSFERRED,
} from './events';
import { FamiliesService } from './families.service';
import { type FamilyRepository } from './repositories/family.repository';

/** In-memory fakes: enough of UserRepository/FamilyRepository for FamiliesService. */
class Store {
  users = new Map<string, User>();
  families = new Map<string, Family>();
  deletedFamilies: string[] = [];
}

function makeUser(
  store: Store,
  id: string,
  familyId: string | null = null,
  role = UserRole.Member,
) {
  const user = Object.assign(new User(), {
    id,
    username: id,
    role,
    status: UserStatus.Active,
    familyId,
  });
  store.users.set(id, user);
  return user;
}

function makeFamily(
  store: Store,
  id: string,
  ownerId: string,
  inviteCode = `CODE${id}`.slice(0, 8),
) {
  const family = Object.assign(new Family(), { id, name: `Family ${id}`, ownerId, inviteCode });
  store.families.set(id, family);
  return family;
}

function fakeUserRepository(store: Store): UserRepository {
  const repo = {
    withManager: () => repo,
    findOneBy: ({ id }: { id: string }) => Promise.resolve(store.users.get(id) ?? null),
    findByIdForUpdate: (id: string) => Promise.resolve(store.users.get(id) ?? null),
    findFamilyMembers: (familyId: string) =>
      Promise.resolve([...store.users.values()].filter((u) => u.familyId === familyId)),
    countFamilyMembers: (familyId: string) =>
      Promise.resolve([...store.users.values()].filter((u) => u.familyId === familyId).length),
    save: (user: User) => {
      store.users.set(user.id, user);
      return Promise.resolve(user);
    },
  };
  return repo as unknown as UserRepository;
}

function fakeFamilyRepository(store: Store): FamilyRepository {
  let seq = 0;
  const repo = {
    withManager: () => repo,
    create: (data: Partial<Family>) => Object.assign(new Family(), data),
    save: (family: Family) => {
      if (!family.id) {
        family.id = `fam-new-${++seq}`;
      }
      store.families.set(family.id, family);
      return Promise.resolve(family);
    },
    findOneBy: ({ id }: { id: string }) => Promise.resolve(store.families.get(id) ?? null),
    findByIdForUpdate: (id: string) => Promise.resolve(store.families.get(id) ?? null),
    findByInviteCode: (code: string) =>
      Promise.resolve([...store.families.values()].find((f) => f.inviteCode === code) ?? null),
    existsByInviteCode: (code: string) =>
      Promise.resolve([...store.families.values()].some((f) => f.inviteCode === code)),
    delete: ({ id }: { id: string }) => {
      store.families.delete(id);
      store.deletedFamilies.push(id);
      return Promise.resolve({ affected: 1 });
    },
  };
  return repo as unknown as FamilyRepository;
}

function setup(codes: string[] = ['NEWCODE1']) {
  const store = new Store();
  const dataSource = {
    transaction: <T>(work: (manager: EntityManager) => Promise<T>) => work({} as EntityManager),
  } as unknown as DataSource;
  const events = { emit: jest.fn() };
  const generator = { generate: jest.fn(() => codes.shift() ?? 'FALLBACK') };
  const service = new FamiliesService(
    dataSource,
    fakeFamilyRepository(store),
    fakeUserRepository(store),
    generator,
    events as unknown as EventEmitter2,
  );
  return { store, service, events, generator };
}

async function expectCode(promise: Promise<unknown>, code: ErrorCode): Promise<void> {
  const error: unknown = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(AppException);
  expect((error as AppException).code).toBe(code);
}

describe('FamiliesService.createFamily — UC-FAM-01, BR-11', () => {
  it('creates the family, makes the creator owner + HOMEMAKER and emits FAMILY_CREATED', async () => {
    const { store, service, events } = setup(['ABCD2345']);
    makeUser(store, 'u1');

    const family = await service.createFamily('u1', 'Nhà A');

    expect(family.ownerId).toBe('u1');
    expect(family.inviteCode).toBe('ABCD2345');
    expect(store.users.get('u1')).toMatchObject({ familyId: family.id, role: UserRole.Homemaker });
    expect(events.emit).toHaveBeenCalledWith(FAMILY_CREATED, expect.anything());
  });

  it('rejects a user who already belongs to a family (BR-11)', async () => {
    const { store, service } = setup();
    makeUser(store, 'u1', 'fam-a');

    await expectCode(service.createFamily('u1', 'Nhà B'), ErrorCode.AlreadyInFamily);
  });

  it('retries invite code generation on collision', async () => {
    const { store, service, generator } = setup(['TAKEN111', 'FRESH222']);
    makeUser(store, 'owner-x');
    makeFamily(store, 'fam-x', 'owner-x', 'TAKEN111');
    makeUser(store, 'u1');

    const family = await service.createFamily('u1', 'Nhà A');

    expect(family.inviteCode).toBe('FRESH222');
    expect(generator.generate).toHaveBeenCalledTimes(2);
  });
});

describe('FamiliesService.joinByInviteCode — UC-FAM-01, BR-11', () => {
  it('joins as MEMBER and emits FAMILY_MEMBER_JOINED', async () => {
    const { store, service, events } = setup();
    makeUser(store, 'owner', 'fam-a', UserRole.Homemaker);
    makeFamily(store, 'fam-a', 'owner', 'JOINME22');
    makeUser(store, 'u2');

    await service.joinByInviteCode('u2', 'JOINME22');

    expect(store.users.get('u2')).toMatchObject({ familyId: 'fam-a', role: UserRole.Member });
    expect(events.emit).toHaveBeenCalledWith(FAMILY_MEMBER_JOINED, expect.anything());
  });

  it('rejects an unknown invite code', async () => {
    const { store, service } = setup();
    makeUser(store, 'u2');

    await expectCode(service.joinByInviteCode('u2', 'NOPE2345'), ErrorCode.InviteCodeInvalid);
    expect(store.users.get('u2')?.familyId).toBeNull();
  });

  it('rejects joining a second family (BR-11)', async () => {
    const { store, service } = setup();
    makeUser(store, 'owner-b', 'fam-b', UserRole.Homemaker);
    makeFamily(store, 'fam-b', 'owner-b', 'FAMILYB2');
    makeUser(store, 'u2', 'fam-a');

    await expectCode(service.joinByInviteCode('u2', 'FAMILYB2'), ErrorCode.AlreadyInFamily);
    expect(store.users.get('u2')?.familyId).toBe('fam-a');
  });
});

describe('FamiliesService.removeMember — BR-06', () => {
  function family() {
    const ctx = setup();
    makeUser(ctx.store, 'owner', 'fam-a', UserRole.Homemaker);
    makeFamily(ctx.store, 'fam-a', 'owner');
    makeUser(ctx.store, 'member', 'fam-a');
    makeUser(ctx.store, 'owner-b', 'fam-b', UserRole.Homemaker);
    makeFamily(ctx.store, 'fam-b', 'owner-b');
    return ctx;
  }

  it('owner removes a member of the same family', async () => {
    const { store, service, events } = family();

    await service.removeMember('owner', 'fam-a', 'member');

    expect(store.users.get('member')).toMatchObject({ familyId: null, role: UserRole.Member });
    expect(events.emit).toHaveBeenCalledWith(FAMILY_MEMBER_REMOVED, expect.anything());
  });

  it('a non-owner cannot remove anyone', async () => {
    const { store, service } = family();
    makeUser(store, 'member2', 'fam-a');

    await expectCode(service.removeMember('member', 'fam-a', 'member2'), ErrorCode.NotFamilyOwner);
  });

  it('a user of ANOTHER family is "not found" and stays untouched (BR-06)', async () => {
    const { store, service } = family();

    await expectCode(service.removeMember('owner', 'fam-a', 'owner-b'), ErrorCode.MemberNotFound);
    expect(store.users.get('owner-b')?.familyId).toBe('fam-b');
  });

  it('the owner cannot remove themself', async () => {
    const { service } = family();

    await expectCode(service.removeMember('owner', 'fam-a', 'owner'), ErrorCode.CannotRemoveSelf);
  });
});

describe('FamiliesService.transferOwnership', () => {
  it('moves ownership to a member, who becomes HOMEMAKER', async () => {
    const { store, service, events } = setup();
    makeUser(store, 'owner', 'fam-a', UserRole.Homemaker);
    makeFamily(store, 'fam-a', 'owner');
    makeUser(store, 'member', 'fam-a');

    const family = await service.transferOwnership('owner', 'fam-a', 'member');

    expect(family.ownerId).toBe('member');
    expect(store.users.get('member')?.role).toBe(UserRole.Homemaker);
    expect(events.emit).toHaveBeenCalledWith(FAMILY_OWNERSHIP_TRANSFERRED, expect.anything());
  });

  it('cannot transfer to a user outside the family (BR-06)', async () => {
    const { store, service } = setup();
    makeUser(store, 'owner', 'fam-a', UserRole.Homemaker);
    makeFamily(store, 'fam-a', 'owner');
    makeUser(store, 'stranger', null);

    await expectCode(
      service.transferOwnership('owner', 'fam-a', 'stranger'),
      ErrorCode.MemberNotFound,
    );
  });
});

describe('FamiliesService.leaveFamily — owner rules (decision B4)', () => {
  it('a member leaves immediately', async () => {
    const { store, service, events } = setup();
    makeUser(store, 'owner', 'fam-a', UserRole.Homemaker);
    makeFamily(store, 'fam-a', 'owner');
    makeUser(store, 'member', 'fam-a');

    await expect(service.leaveFamily('member')).resolves.toEqual({ dissolved: false });
    expect(store.users.get('member')?.familyId).toBeNull();
    expect(events.emit).toHaveBeenCalledWith(FAMILY_MEMBER_LEFT, expect.anything());
  });

  it('the owner must transfer ownership while other members remain', async () => {
    const { store, service } = setup();
    makeUser(store, 'owner', 'fam-a', UserRole.Homemaker);
    makeFamily(store, 'fam-a', 'owner');
    makeUser(store, 'member', 'fam-a');

    await expectCode(service.leaveFamily('owner'), ErrorCode.OwnerMustTransfer);
    expect(store.users.get('owner')?.familyId).toBe('fam-a');
  });

  it('the last remaining owner leaving dissolves the family', async () => {
    const { store, service, events } = setup();
    makeUser(store, 'owner', 'fam-a', UserRole.Homemaker);
    makeFamily(store, 'fam-a', 'owner');

    await expect(service.leaveFamily('owner')).resolves.toEqual({ dissolved: true });
    expect(store.deletedFamilies).toEqual(['fam-a']);
    expect(store.users.get('owner')).toMatchObject({ familyId: null, role: UserRole.Member });
    expect(events.emit).toHaveBeenCalledWith(FAMILY_DISSOLVED, expect.anything());
  });

  it('a user without a family cannot leave', async () => {
    const { store, service } = setup();
    makeUser(store, 'loner');

    await expectCode(service.leaveFamily('loner'), ErrorCode.FamilyRequired);
  });
});

describe('FamiliesService.regenerateInviteCode', () => {
  it('only the owner can rotate the code', async () => {
    const { store, service } = setup(['ROTATED2']);
    makeUser(store, 'owner', 'fam-a', UserRole.Homemaker);
    makeFamily(store, 'fam-a', 'owner', 'OLDCODE2');
    makeUser(store, 'member', 'fam-a');

    await expectCode(service.regenerateInviteCode('member', 'fam-a'), ErrorCode.NotFamilyOwner);
    await expect(service.regenerateInviteCode('owner', 'fam-a')).resolves.toBe('ROTATED2');
    expect(store.families.get('fam-a')?.inviteCode).toBe('ROTATED2');
  });
});
