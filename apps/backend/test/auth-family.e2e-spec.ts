/**
 * e2e (B4): authentication, families and BR-06 family isolation, against real PostgreSQL.
 *
 * Scenario
 *   Family A: ownerA (creates) + memberA (joins with the invite code)
 *   Family B: ownerB (creates) + memberB (joins)
 * Then every cross-family access attempt must fail and leak nothing.
 */
import { UserRole } from '@dctl/shared';
import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { type App } from 'supertest/types';
import { DataSource, In } from 'typeorm';
import { ErrorCode } from '../src/common/exceptions/error-code.enum';
import { TOKEN_STALE_HEADER } from '../src/modules/auth/guards/jwt-auth.guard';
import { Family } from '../src/modules/families/entities/family.entity';
import { User } from '../src/modules/users/entities/user.entity';
import { createTestApp, decodeJwt, uniqueSuffix } from './helpers/test-app';

interface Session {
  id: string;
  username: string;
  accessToken: string;
  refreshToken: string;
}

interface FamilyBody {
  id: string;
  name: string;
  ownerId: string;
  inviteCode?: string;
  members: { id: string; username: string; role: UserRole; isOwner: boolean }[];
}

const PASSWORD = 'Test@1234';

describe('Auth + families + BR-06 isolation (e2e)', () => {
  let app: INestApplication<App>;
  const suffix = uniqueSuffix();
  const usernames: string[] = [];
  const familyIds: string[] = [];

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function register(name: string): Promise<Session> {
    const username = `${name}_${suffix}`.toLowerCase();
    usernames.push(username);
    const res = await http()
      .post('/api/auth/register')
      .send({ username, email: `${username}@e2e.test`, password: PASSWORD })
      .expect(201);
    const body = res.body as {
      data: { accessToken: string; refreshToken: string; user: { id: string } };
    };
    return {
      id: body.data.user.id,
      username,
      accessToken: body.data.accessToken,
      refreshToken: body.data.refreshToken,
    };
  }

  async function login(username: string, password = PASSWORD): Promise<Session> {
    const res = await http()
      .post('/api/auth/login')
      .send({ login: username, password })
      .expect(200);
    const body = res.body as {
      data: { accessToken: string; refreshToken: string; user: { id: string } };
    };
    return {
      id: body.data.user.id,
      username,
      accessToken: body.data.accessToken,
      refreshToken: body.data.refreshToken,
    };
  }

  async function myFamily(session: Session): Promise<FamilyBody> {
    const res = await http().get('/api/families/me').set(auth(session.accessToken)).expect(200);
    return (res.body as { data: FamilyBody }).data;
  }

  let ownerA: Session;
  let memberA: Session;
  let ownerB: Session;
  let memberB: Session;
  let familyA: FamilyBody;
  let familyB: FamilyBody;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    const dataSource = app.get(DataSource);
    if (familyIds.length > 0) {
      await dataSource.getRepository(Family).delete({ id: In(familyIds) });
    }
    if (usernames.length > 0) {
      await dataSource.getRepository(User).delete({ username: In(usernames) });
    }
    await app.close();
  });

  describe('UC-AUTH-01/02 + UC-FAM-01: register → create family → invite → member login', () => {
    it('registers the owner of family A (no family yet)', async () => {
      ownerA = await register('ownerA');

      expect(decodeJwt(ownerA.accessToken)).toMatchObject({
        sub: ownerA.id,
        role: UserRole.Member,
        familyId: null,
      });
      const res = await http().get('/api/families/me').set(auth(ownerA.accessToken)).expect(403);
      expect(res.body).toMatchObject({ code: ErrorCode.FamilyRequired });
    });

    it('creates family A; the creator becomes owner/HOMEMAKER and sees the invite code', async () => {
      const res = await http()
        .post('/api/families')
        .set(auth(ownerA.accessToken))
        .send({ name: `Nhà A ${suffix}` })
        .expect(201);
      familyA = (res.body as { data: FamilyBody }).data;
      familyIds.push(familyA.id);

      expect(familyA.ownerId).toBe(ownerA.id);
      expect(familyA.inviteCode).toMatch(/^[A-Z0-9]{8}$/);
      expect(familyA.members).toEqual([
        expect.objectContaining({ id: ownerA.id, role: UserRole.Homemaker, isOwner: true }),
      ]);
    });

    it('refresh returns a token whose claims carry the new familyId and role', async () => {
      const res = await http()
        .post('/api/auth/refresh')
        .send({ refreshToken: ownerA.refreshToken })
        .expect(200);
      const tokens = (res.body as { data: { accessToken: string; refreshToken: string } }).data;
      ownerA = { ...ownerA, ...tokens };

      expect(decodeJwt(ownerA.accessToken)).toMatchObject({
        familyId: familyA.id,
        role: UserRole.Homemaker,
      });
    });

    it('a new user joins with the invite code (case-insensitive) as MEMBER', async () => {
      memberA = await register('memberA');
      const res = await http()
        .post('/api/families/join')
        .set(auth(memberA.accessToken))
        .send({ inviteCode: familyA.inviteCode?.toLowerCase() })
        .expect(200);
      const joined = (res.body as { data: FamilyBody }).data;

      expect(joined.id).toBe(familyA.id);
      expect(joined.inviteCode).toBeUndefined(); // only the owner sees the code
    });

    it('the member logs in and sees family A with both members', async () => {
      memberA = await login(memberA.username);
      const family = await myFamily(memberA);

      expect(decodeJwt(memberA.accessToken)).toMatchObject({ familyId: familyA.id });
      expect(family.members.map((m) => m.username).sort()).toEqual(
        [ownerA.username, memberA.username].sort(),
      );
    });

    it('a MEMBER cannot rotate the invite code (RolesGuard)', async () => {
      const res = await http()
        .post('/api/families/me/invite-code')
        .set(auth(memberA.accessToken))
        .expect(403);
      expect(res.body).toMatchObject({ code: ErrorCode.Forbidden });
    });

    it('sets up family B (ownerB + memberB) for the isolation tests', async () => {
      ownerB = await register('ownerB');
      const created = await http()
        .post('/api/families')
        .set(auth(ownerB.accessToken))
        .send({ name: `Nhà B ${suffix}` })
        .expect(201);
      familyB = (created.body as { data: FamilyBody }).data;
      familyIds.push(familyB.id);

      memberB = await register('memberB');
      await http()
        .post('/api/families/join')
        .set(auth(memberB.accessToken))
        .send({ inviteCode: familyB.inviteCode })
        .expect(200);
      await http()
        .put('/api/users/me/dietary-profile')
        .set(auth(memberB.accessToken))
        .send({ allergies: [{ name: 'Tôm' }], tastePreferences: ['ít cay'], nutritionGoal: 'B' })
        .expect(200);
    });
  });

  describe('BR-06: a user of family A can read nothing of family B', () => {
    it('GET /families/me only ever returns the caller’s own family', async () => {
      for (const session of [ownerA, memberA]) {
        const family = await myFamily(session);
        expect(family.id).toBe(familyA.id);
        const names = family.members.map((m) => m.username);
        expect(names).not.toContain(ownerB.username);
        expect(names).not.toContain(memberB.username);
      }
    });

    it('a familyId smuggled in the query string is ignored', async () => {
      const res = await http()
        .get(`/api/families/me?familyId=${familyB.id}`)
        .set(auth(ownerA.accessToken))
        .expect(200);
      expect((res.body as { data: FamilyBody }).data.id).toBe(familyA.id);
    });

    it('a familyId or userId smuggled in a body is rejected (forbidNonWhitelisted)', async () => {
      const res = await http()
        .put('/api/users/me/dietary-profile')
        .set(auth(memberA.accessToken))
        .send({ userId: memberB.id, familyId: familyB.id, allergies: [], tastePreferences: [] })
        .expect(400);
      const fields = (res.body as { details: { field: string }[] }).details.map((d) => d.field);
      expect(fields).toEqual(expect.arrayContaining(['userId', 'familyId']));
    });

    it('the dietary profile endpoint returns only the caller’s own profile', async () => {
      const res = await http()
        .get('/api/users/me/dietary-profile')
        .set(auth(memberA.accessToken))
        .expect(200);
      expect(res.body).toMatchObject({ data: { allergies: [], tastePreferences: [] } });
    });

    it('owner A cannot remove a member of family B (404, B untouched)', async () => {
      const res = await http()
        .delete(`/api/families/me/members/${memberB.id}`)
        .set(auth(ownerA.accessToken))
        .expect(404);
      expect(res.body).toMatchObject({ code: ErrorCode.MemberNotFound });
      expect((await myFamily(memberB)).id).toBe(familyB.id);
    });

    it('owner A cannot transfer ownership to a user of family B', async () => {
      const res = await http()
        .post('/api/families/me/transfer-ownership')
        .set(auth(ownerA.accessToken))
        .send({ newOwnerId: ownerB.id })
        .expect(404);
      expect(res.body).toMatchObject({ code: ErrorCode.MemberNotFound });
    });

    it('BR-11: a member of A cannot join B even with B’s invite code', async () => {
      const res = await http()
        .post('/api/families/join')
        .set(auth(memberA.accessToken))
        .send({ inviteCode: familyB.inviteCode })
        .expect(409);
      expect(res.body).toMatchObject({ code: ErrorCode.AlreadyInFamily });
    });

    it('BR-11 under concurrency: simultaneous create + join → exactly one succeeds', async () => {
      const racer = await register('racer');
      const create = http()
        .post('/api/families')
        .set(auth(racer.accessToken))
        .send({ name: `Nhà race ${suffix}` });
      const join = http()
        .post('/api/families/join')
        .set(auth(racer.accessToken))
        .send({ inviteCode: familyB.inviteCode });
      const results = await Promise.all([create, join]);

      const ok = results.filter((r) => r.status === 200 || r.status === 201);
      const conflicts = results.filter((r) => r.status === 409);
      expect(ok).toHaveLength(1);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0]?.body).toMatchObject({ code: ErrorCode.AlreadyInFamily });

      const created = results.find((r) => r.status === 201);
      if (created) {
        familyIds.push((created.body as { data: FamilyBody }).data.id);
      } else {
        // Joined B: leave again so B keeps its original two members for later tests.
        await http().post('/api/families/me/leave').set(auth(racer.accessToken)).expect(200);
      }
    });

    it('a token signed with another key is rejected', async () => {
      const [header, payload] = ownerA.accessToken.split('.');
      const forged = `${header}.${payload}.${Buffer.from('forged').toString('base64url')}`;
      const res = await http().get('/api/families/me').set(auth(forged)).expect(401);
      expect(res.body).toMatchObject({ code: ErrorCode.TokenInvalid });
    });

    it('a removed member loses family access IMMEDIATELY, even with the old token', async () => {
      const outsider = await register('kicked');
      await http()
        .post('/api/families/join')
        .set(auth(outsider.accessToken))
        .send({ inviteCode: familyA.inviteCode })
        .expect(200);
      const stillValidToken = (await login(outsider.username)).accessToken;
      expect(decodeJwt(stillValidToken)).toMatchObject({ familyId: familyA.id });

      await http()
        .delete(`/api/families/me/members/${outsider.id}`)
        .set(auth(ownerA.accessToken))
        .expect(204);

      const res = await http().get('/api/families/me').set(auth(stillValidToken)).expect(403);
      expect(res.body).toMatchObject({ code: ErrorCode.FamilyRequired });
      expect(res.headers[TOKEN_STALE_HEADER.toLowerCase()]).toBe('1');
    });
  });

  describe('Sessions: refresh rotation, logout, change password', () => {
    it('reusing a rotated refresh token revokes every session of the user', async () => {
      const first = await login(memberB.username);
      const rotated = await http()
        .post('/api/auth/refresh')
        .send({ refreshToken: first.refreshToken })
        .expect(200);
      const second = (rotated.body as { data: { refreshToken: string } }).data.refreshToken;

      await http().post('/api/auth/refresh').send({ refreshToken: first.refreshToken }).expect(401);
      // The legitimately rotated token was revoked too (suspected theft).
      await http().post('/api/auth/refresh').send({ refreshToken: second }).expect(401);
    });

    it('logout revokes the refresh token', async () => {
      const session = await login(memberB.username);
      await http()
        .post('/api/auth/logout')
        .send({ refreshToken: session.refreshToken })
        .expect(204);
      await http()
        .post('/api/auth/refresh')
        .send({ refreshToken: session.refreshToken })
        .expect(401);
    });

    it('change password: old sessions die, new password works, old one does not', async () => {
      const other = await login(memberB.username);
      const current = await login(memberB.username);
      await http()
        .post('/api/auth/change-password')
        .set(auth(current.accessToken))
        .send({ currentPassword: PASSWORD, newPassword: 'Changed@5678' })
        .expect(200);

      await http().post('/api/auth/refresh').send({ refreshToken: other.refreshToken }).expect(401);
      await http()
        .post('/api/auth/login')
        .send({ login: memberB.username, password: PASSWORD })
        .expect(401);
      await login(memberB.username, 'Changed@5678');
    });

    it('wrong credentials give one generic Vietnamese error', async () => {
      const res = await http()
        .post('/api/auth/login')
        .send({ login: `nobody_${suffix}`, password: PASSWORD })
        .expect(401);
      expect(res.body).toEqual({
        code: ErrorCode.InvalidCredentials,
        message: 'Tên đăng nhập hoặc mật khẩu không đúng.',
      });
    });
  });

  describe('Leaving a family (owner must transfer first)', () => {
    it('the owner cannot leave while members remain', async () => {
      const res = await http()
        .post('/api/families/me/leave')
        .set(auth(ownerA.accessToken))
        .expect(409);
      expect(res.body).toMatchObject({ code: ErrorCode.OwnerMustTransfer });
    });

    it('after transferring ownership the old owner can leave', async () => {
      const res = await http()
        .post('/api/families/me/transfer-ownership')
        .set(auth(ownerA.accessToken))
        .send({ newOwnerId: memberA.id })
        .expect(200);
      expect((res.body as { data: FamilyBody }).data.ownerId).toBe(memberA.id);

      await http()
        .post('/api/families/me/leave')
        .set(auth(ownerA.accessToken))
        .expect(200, { data: { dissolved: false } });
    });

    it('the last member (new owner) leaving dissolves the family', async () => {
      await http()
        .post('/api/families/me/leave')
        .set(auth(memberA.accessToken))
        .expect(200, { data: { dissolved: true } });
      const gone = await app.get(DataSource).getRepository(Family).findOneBy({ id: familyA.id });
      expect(gone).toBeNull();
    });
  });
});
