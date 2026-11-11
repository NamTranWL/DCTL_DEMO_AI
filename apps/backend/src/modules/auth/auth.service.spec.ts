import { UserRole, UserStatus } from '@dctl/shared';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCode } from '../../common/exceptions/error-code.enum';
import { User } from '../users/entities/user.entity';
import { type UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { type AuthTokensResponse } from './dto/auth.dto';
import { type PasswordHasher } from './password-hasher.service';
import { type TokenService } from './token.service';

const TOKENS: AuthTokensResponse = {
  tokenType: 'Bearer',
  accessToken: 'access',
  expiresIn: 900,
  refreshToken: 'refresh',
  refreshExpiresAt: new Date('2026-12-10T00:00:00Z'),
};

function user(overrides: Partial<User> = {}): User {
  return Object.assign(new User(), {
    id: 'u1',
    username: 'noitro',
    email: 'noitro@dctl.local',
    passwordHash: 'hash:Demo@123',
    role: UserRole.Member,
    status: UserStatus.Active,
    familyId: null,
    createdAt: new Date(),
    ...overrides,
  });
}

function setup() {
  const usersService = {
    createAccount: jest.fn((a: { username: string; email: string; passwordHash: string }) =>
      Promise.resolve(user(a)),
    ),
    findForLogin: jest.fn(),
    findWithPassword: jest.fn(),
    getById: jest.fn(),
    updatePasswordHash: jest.fn(),
  };
  const passwords = {
    hash: jest.fn((plain: string) => Promise.resolve(`hash:${plain}`)),
    verify: jest.fn((plain: string, hash: string) => Promise.resolve(hash === `hash:${plain}`)),
    verifyAgainstDummy: jest.fn(() => Promise.resolve(false)),
  };
  const tokens = {
    issueTokens: jest.fn(() => Promise.resolve(TOKENS)),
    consumeRefreshToken: jest.fn(),
    revokeRefreshToken: jest.fn(),
    revokeAllForUser: jest.fn(),
  };
  const service = new AuthService(
    usersService as unknown as UsersService,
    passwords as unknown as PasswordHasher,
    tokens as unknown as TokenService,
  );
  return { service, usersService, passwords, tokens };
}

async function expectCode(promise: Promise<unknown>, code: ErrorCode): Promise<void> {
  const error: unknown = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(AppException);
  expect((error as AppException).code).toBe(code);
}

describe('AuthService.register — UC-AUTH-01', () => {
  it('stores a password hash (never the plain password) and returns a session', async () => {
    const { service, usersService } = setup();

    const session = await service.register({
      username: 'noitro',
      email: 'noitro@dctl.local',
      password: 'Demo@123',
    });

    expect(usersService.createAccount).toHaveBeenCalledWith({
      username: 'noitro',
      email: 'noitro@dctl.local',
      passwordHash: 'hash:Demo@123',
    });
    expect(session.accessToken).toBe('access');
    expect(session.user).not.toHaveProperty('passwordHash');
  });
});

describe('AuthService.login — UC-AUTH-02', () => {
  it('logs in with correct credentials', async () => {
    const { service, usersService } = setup();
    usersService.findForLogin.mockResolvedValue(user());

    const session = await service.login({ login: 'noitro', password: 'Demo@123' });

    expect(session.user.username).toBe('noitro');
  });

  it('wrong password → AUTH_INVALID_CREDENTIALS', async () => {
    const { service, usersService } = setup();
    usersService.findForLogin.mockResolvedValue(user());

    await expectCode(
      service.login({ login: 'noitro', password: 'wrong' }),
      ErrorCode.InvalidCredentials,
    );
  });

  it('unknown user → same error, still spends a hash comparison (no user enumeration)', async () => {
    const { service, usersService, passwords } = setup();
    usersService.findForLogin.mockResolvedValue(null);

    await expectCode(
      service.login({ login: 'ghost', password: 'Demo@123' }),
      ErrorCode.InvalidCredentials,
    );
    expect(passwords.verifyAgainstDummy).toHaveBeenCalled();
  });

  it('locked account → AUTH_ACCOUNT_LOCKED', async () => {
    const { service, usersService } = setup();
    usersService.findForLogin.mockResolvedValue(user({ status: UserStatus.Locked }));

    await expectCode(
      service.login({ login: 'noitro', password: 'Demo@123' }),
      ErrorCode.AccountLocked,
    );
  });
});

describe('AuthService.refresh', () => {
  it('rotates the refresh token and re-issues claims from the database', async () => {
    const { service, usersService, tokens } = setup();
    tokens.consumeRefreshToken.mockResolvedValue('u1');
    usersService.getById.mockResolvedValue(user({ familyId: 'fam-a' }));

    await service.refresh('old-refresh');

    expect(tokens.consumeRefreshToken).toHaveBeenCalledWith('old-refresh');
    expect(tokens.issueTokens).toHaveBeenCalledWith(expect.objectContaining({ familyId: 'fam-a' }));
  });

  it('refuses locked accounts', async () => {
    const { service, usersService, tokens } = setup();
    tokens.consumeRefreshToken.mockResolvedValue('u1');
    usersService.getById.mockResolvedValue(user({ status: UserStatus.Locked }));

    await expectCode(service.refresh('r'), ErrorCode.AccountLocked);
  });
});

describe('AuthService.changePassword', () => {
  it('rejects a wrong current password', async () => {
    const { service, usersService } = setup();
    usersService.findWithPassword.mockResolvedValue(user());

    await expectCode(
      service.changePassword('u1', { currentPassword: 'bad', newPassword: 'NewPass123' }),
      ErrorCode.WrongCurrentPassword,
    );
  });

  it('rejects reusing the same password', async () => {
    const { service, usersService } = setup();
    usersService.findWithPassword.mockResolvedValue(user());

    await expectCode(
      service.changePassword('u1', { currentPassword: 'Demo@123', newPassword: 'Demo@123' }),
      ErrorCode.SamePassword,
    );
  });

  it('updates the hash, revokes every session and issues a new pair', async () => {
    const { service, usersService, tokens } = setup();
    usersService.findWithPassword.mockResolvedValue(user());

    await service.changePassword('u1', { currentPassword: 'Demo@123', newPassword: 'NewPass123' });

    expect(usersService.updatePasswordHash).toHaveBeenCalledWith('u1', 'hash:NewPass123');
    expect(tokens.revokeAllForUser).toHaveBeenCalledWith('u1');
    expect(tokens.issueTokens).toHaveBeenCalled();
  });
});
