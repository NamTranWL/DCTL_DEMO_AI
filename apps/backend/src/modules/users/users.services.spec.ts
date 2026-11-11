import { UserRole } from '@dctl/shared';
import { QueryFailedError } from 'typeorm';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCode } from '../../common/exceptions/error-code.enum';
import { dedupeAllergies, DietaryProfileService } from './dietary-profile.service';
import { DietaryProfile } from './entities/dietary-profile.entity';
import { User } from './entities/user.entity';
import { type DietaryProfileRepository } from './repositories/dietary-profile.repository';
import { type UserRepository } from './repositories/user.repository';
import { UsersService } from './users.service';

describe('UsersService.createAccount — UC-AUTH-01', () => {
  function setup(existing: { username?: boolean; email?: boolean } = {}) {
    const repo = {
      existsByUsername: jest.fn(() => Promise.resolve(existing.username ?? false)),
      existsByEmail: jest.fn(() => Promise.resolve(existing.email ?? false)),
      create: (data: Partial<User>) => Object.assign(new User(), data),
      save: jest.fn((u: User) => Promise.resolve(Object.assign(u, { id: 'new-id' }))),
    };
    return { service: new UsersService(repo as unknown as UserRepository), repo };
  }
  const account = { username: 'noitro', email: 'a@b.vn', passwordHash: 'h' };

  it('creates a MEMBER without a family', async () => {
    const { service } = setup();

    await expect(service.createAccount(account)).resolves.toMatchObject({
      role: UserRole.Member,
      familyId: null,
    });
  });

  it.each([
    [{ username: true }, ErrorCode.UsernameTaken],
    [{ email: true }, ErrorCode.EmailTaken],
  ])('rejects duplicates %p → %s', async (existing, code) => {
    const error: unknown = await setup(existing)
      .service.createAccount(account)
      .catch((e: unknown) => e);

    expect((error as AppException).code).toBe(code);
  });

  it('translates a concurrent unique violation on email into AUTH_EMAIL_TAKEN', async () => {
    const { service, repo } = setup();
    repo.save.mockRejectedValue(
      new QueryFailedError('INSERT', [], {
        code: '23505',
        constraint: 'uq_users_email',
      } as unknown as Error),
    );

    const error: unknown = await service.createAccount(account).catch((e: unknown) => e);

    expect((error as AppException).code).toBe(ErrorCode.EmailTaken);
  });
});

describe('DietaryProfileService — UC-FAM-02, BR-07', () => {
  function setup(existing: DietaryProfile | null = null) {
    const repo = {
      findByUserId: jest.fn(() => Promise.resolve(existing)),
      create: (data: Partial<DietaryProfile>) => Object.assign(new DietaryProfile(), data),
      save: jest.fn((p: DietaryProfile) => Promise.resolve(p)),
      delete: jest.fn(() => Promise.resolve({ affected: 1 })),
    };
    return {
      service: new DietaryProfileService(repo as unknown as DietaryProfileRepository),
      repo,
    };
  }

  it('creates a profile when none exists, deduplicating input', async () => {
    const { service } = setup();

    const profile = await service.upsert('u1', {
      allergies: [{ name: 'Tôm' }, { name: 'tôm' }, { name: 'Đậu phộng' }],
      tastePreferences: ['ít cay', 'ít cay'],
      nutritionGoal: '',
    });

    expect(profile.userId).toBe('u1');
    expect(profile.allergies).toEqual([{ name: 'Tôm' }, { name: 'Đậu phộng' }]);
    expect(profile.tastePreferences).toEqual(['ít cay']);
    expect(profile.nutritionGoal).toBeNull();
  });

  it('replaces an existing profile entirely (PUT semantics)', async () => {
    const existing = Object.assign(new DietaryProfile(), {
      userId: 'u1',
      allergies: [{ name: 'Tôm' }],
      tastePreferences: ['ít ngọt'],
      nutritionGoal: 'Giảm cân',
    });
    const { service } = setup(existing);

    const profile = await service.upsert('u1', { allergies: [], tastePreferences: [] });

    expect(profile).toMatchObject({ allergies: [], tastePreferences: [], nutritionGoal: null });
  });

  it('reset deletes only the caller’s own profile', async () => {
    const { service, repo } = setup();

    await service.reset('u1');

    expect(repo.delete).toHaveBeenCalledWith({ userId: 'u1' });
  });
});

describe('dedupeAllergies', () => {
  it('merges entries with the same foodId or the same name', () => {
    expect(
      dedupeAllergies([
        { foodId: 'f1', name: 'Tôm' },
        { foodId: 'f1', name: 'Tôm sú' },
        { name: 'TÔM' },
        { name: 'Cua' },
      ]),
    ).toEqual([{ foodId: 'f1', name: 'Tôm' }, { name: 'Cua' }]);
  });
});
