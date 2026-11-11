import { UserRole } from '@dctl/shared';
import { JwtService } from '@nestjs/jwt';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCode } from '../../common/exceptions/error-code.enum';
import { type JwtConfig } from '../../config/configuration';
import { RefreshToken } from './entities/refresh-token.entity';
import { type RefreshTokenRepository } from './repositories/refresh-token.repository';
import { hashRefreshToken, TokenService } from './token.service';

const SECRET = 'unit-test-secret-0123456789abcdef0123456789';
const CONFIG: JwtConfig = { secret: SECRET, accessTtlSeconds: 900, refreshTtlDays: 30 };

function setup() {
  const saved: RefreshToken[] = [];
  const repo = {
    create: (data: Partial<RefreshToken>) => Object.assign(new RefreshToken(), data),
    save: jest.fn((token: RefreshToken) => {
      saved.push(token);
      return Promise.resolve(token);
    }),
    findByHash: jest.fn((hash: string) =>
      Promise.resolve(saved.find((t) => t.tokenHash === hash) ?? null),
    ),
    revokeAllForUser: jest.fn(() => Promise.resolve(1)),
  };
  const jwt = new JwtService({ secret: SECRET, signOptions: { algorithm: 'HS256' } });
  const service = new TokenService(jwt, repo as unknown as RefreshTokenRepository, CONFIG);
  return { service, repo, saved, jwt };
}

const subject = { id: 'u1', role: UserRole.Homemaker, familyId: 'fam-a' };

async function expectCode(promise: Promise<unknown>, code: ErrorCode): Promise<void> {
  const error: unknown = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(AppException);
  expect((error as AppException).code).toBe(code);
}

describe('TokenService.issueTokens', () => {
  it('signs {sub, role, familyId} and stores only the refresh token hash', async () => {
    const { service, saved } = setup();

    const tokens = await service.issueTokens(subject);
    const payload = await service.verifyAccessToken(tokens.accessToken);

    expect(payload).toMatchObject({ sub: 'u1', role: UserRole.Homemaker, familyId: 'fam-a' });
    expect(tokens.expiresIn).toBe(900);
    expect(saved[0]?.tokenHash).toBe(hashRefreshToken(tokens.refreshToken));
    expect(saved[0]?.tokenHash).not.toBe(tokens.refreshToken);
  });
});

describe('TokenService.verifyAccessToken', () => {
  it('rejects a token signed with another secret', async () => {
    const { service } = setup();
    const forged = await new JwtService({ secret: 'x'.repeat(40) }).signAsync({ sub: 'u1' });

    await expectCode(service.verifyAccessToken(forged), ErrorCode.TokenInvalid);
  });

  it('reports expiry separately', async () => {
    const { service, jwt } = setup();
    const expired = await jwt.signAsync({ sub: 'u1', exp: Math.floor(Date.now() / 1000) - 10 });

    await expectCode(service.verifyAccessToken(expired), ErrorCode.TokenExpired);
  });
});

describe('TokenService.consumeRefreshToken (rotation)', () => {
  it('accepts an active token once and revokes it', async () => {
    const { service, saved } = setup();
    const { refreshToken } = await service.issueTokens(subject);

    await expect(service.consumeRefreshToken(refreshToken)).resolves.toBe('u1');
    expect(saved[0]?.revokedAt).not.toBeNull();
  });

  it('reuse of a revoked token revokes ALL sessions of that user', async () => {
    const { service, repo } = setup();
    const { refreshToken } = await service.issueTokens(subject);
    await service.consumeRefreshToken(refreshToken);

    await expectCode(service.consumeRefreshToken(refreshToken), ErrorCode.RefreshTokenInvalid);
    expect(repo.revokeAllForUser).toHaveBeenCalledWith('u1', expect.any(Date));
  });

  it('rejects unknown and expired tokens', async () => {
    const { service } = setup();
    await expectCode(service.consumeRefreshToken('unknown-token'), ErrorCode.RefreshTokenInvalid);

    const { refreshToken } = await service.issueTokens(subject, new Date('2020-01-01T00:00:00Z'));
    await expectCode(service.consumeRefreshToken(refreshToken), ErrorCode.RefreshTokenInvalid);
  });
});
