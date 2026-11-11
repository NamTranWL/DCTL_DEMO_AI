import { UserRole, UserStatus } from '@dctl/shared';
import { type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  IS_PUBLIC_KEY,
  REQUIRE_FAMILY_KEY,
  ROLES_KEY,
} from '../../../common/decorators/auth.decorators';
import { AppException } from '../../../common/exceptions/app.exception';
import { ErrorCode } from '../../../common/exceptions/error-code.enum';
import { type AuthUser } from '../../../common/types/auth-user';
import { type UsersService } from '../../users/users.service';
import { AccessTokenAuthenticator } from '../access-token.authenticator';
import { type TokenService } from '../token.service';
import { FamilyMemberGuard } from './family-member.guard';
import { extractBearerToken, JwtAuthGuard, TOKEN_STALE_HEADER } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';

interface FakeRequest {
  headers: { authorization?: string };
  user?: AuthUser;
}

function context(metadata: Record<string, unknown>, request: FakeRequest) {
  const headers: Record<string, string> = {};
  const reflector = new Reflector();
  jest
    .spyOn(reflector, 'getAllAndOverride')
    .mockImplementation((key: unknown) => metadata[key as string]);
  const ctx = {
    getType: () => 'http',
    getHandler: () => () => undefined,
    getClass: () => class Dummy {},
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({ setHeader: (k: string, v: string) => (headers[k] = v) }),
    }),
  } as unknown as ExecutionContext;
  return { ctx, reflector, headers };
}

const activeUser: AuthUser = {
  id: 'u1',
  username: 'noitro',
  role: UserRole.Homemaker,
  status: UserStatus.Active,
  familyId: 'fam-a',
};

async function expectCode(run: () => unknown, code: ErrorCode): Promise<void> {
  const error: unknown = await Promise.resolve()
    .then(run)
    .catch((e: unknown) => e);
  expect(error).toBeInstanceOf(AppException);
  expect((error as AppException).code).toBe(code);
}

describe('JwtAuthGuard', () => {
  function guard(metadata: Record<string, unknown>, request: FakeRequest, dbUser = activeUser) {
    const { ctx, reflector, headers } = context(metadata, request);
    const tokens = {
      verifyAccessToken: jest.fn(() =>
        Promise.resolve({ sub: 'u1', role: UserRole.Homemaker, familyId: 'fam-a' }),
      ),
    };
    const users = { findAuthUser: jest.fn(() => Promise.resolve(dbUser)) };
    const authenticator = new AccessTokenAuthenticator(
      tokens as unknown as TokenService,
      users as unknown as UsersService,
    );
    const instance = new JwtAuthGuard(reflector, authenticator);
    return { run: () => instance.canActivate(ctx), headers, request };
  }

  it('lets @Public() endpoints through without a token', async () => {
    await expect(guard({ [IS_PUBLIC_KEY]: true }, { headers: {} }).run()).resolves.toBe(true);
  });

  it('rejects a request without a bearer token', async () => {
    await expectCode(guard({}, { headers: {} }).run, ErrorCode.TokenMissing);
  });

  it('attaches the user loaded from the database', async () => {
    const g = guard({}, { headers: { authorization: 'Bearer abc' } });

    await expect(g.run()).resolves.toBe(true);
    expect(g.request.user).toEqual(activeUser);
    expect(g.headers[TOKEN_STALE_HEADER]).toBeUndefined();
  });

  it('uses the DATABASE familyId and flags the token as stale when it differs (BR-06)', async () => {
    const removed = { ...activeUser, familyId: null, role: UserRole.Member };
    const g = guard({}, { headers: { authorization: 'Bearer abc' } }, removed);

    await g.run();

    expect(g.request.user?.familyId).toBeNull();
    expect(g.headers[TOKEN_STALE_HEADER]).toBe('1');
  });

  it('blocks locked accounts immediately', async () => {
    const locked = { ...activeUser, status: UserStatus.Locked };

    await expectCode(
      guard({}, { headers: { authorization: 'Bearer abc' } }, locked).run,
      ErrorCode.AccountLocked,
    );
  });
});

describe('extractBearerToken', () => {
  it.each([
    [undefined, null],
    ['Basic abc', null],
    ['Bearer', null],
    ['Bearer abc', 'abc'],
    ['bearer abc', 'abc'],
  ])('%p → %p', (header, expected) => {
    expect(extractBearerToken(header)).toBe(expected);
  });
});

describe('RolesGuard', () => {
  it('allows when no @Roles() is set', () => {
    const { ctx, reflector } = context({}, { headers: {}, user: activeUser });

    expect(new RolesGuard(reflector).canActivate(ctx)).toBe(true);
  });

  it('allows a listed role and forbids others', async () => {
    const meta = { [ROLES_KEY]: [UserRole.Homemaker] };
    const ok = context(meta, { headers: {}, user: activeUser });
    const ko = context(meta, { headers: {}, user: { ...activeUser, role: UserRole.Member } });

    expect(new RolesGuard(ok.reflector).canActivate(ok.ctx)).toBe(true);
    await expectCode(() => new RolesGuard(ko.reflector).canActivate(ko.ctx), ErrorCode.Forbidden);
  });
});

describe('FamilyMemberGuard — BR-06, BR-11', () => {
  it('ignores endpoints without @RequireFamily()', () => {
    const { ctx, reflector } = context(
      {},
      { headers: {}, user: { ...activeUser, familyId: null } },
    );

    expect(new FamilyMemberGuard(reflector).canActivate(ctx)).toBe(true);
  });

  it('requires a family when @RequireFamily() is set', async () => {
    const meta = { [REQUIRE_FAMILY_KEY]: true };
    const member = context(meta, { headers: {}, user: activeUser });
    const loner = context(meta, { headers: {}, user: { ...activeUser, familyId: null } });

    expect(new FamilyMemberGuard(member.reflector).canActivate(member.ctx)).toBe(true);
    await expectCode(
      () => new FamilyMemberGuard(loner.reflector).canActivate(loner.ctx),
      ErrorCode.FamilyRequired,
    );
  });
});
