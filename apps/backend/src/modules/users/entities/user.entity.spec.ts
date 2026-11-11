import { UserRole, UserStatus } from '@dctl/shared';
import { InvalidStateTransitionException } from '../../../common/exceptions/domain.exceptions';
import { User } from './user.entity';

function user(role = UserRole.Member, familyId: string | null = null): User {
  const u = new User();
  u.role = role;
  u.familyId = familyId;
  u.status = UserStatus.Active;
  return u;
}

describe('User family membership — BR-11', () => {
  it('joins a family with the given role', () => {
    const u = user();
    u.joinFamily('family-a', UserRole.Homemaker);

    expect(u.familyId).toBe('family-a');
    expect(u.role).toBe(UserRole.Homemaker);
  });

  it('cannot join a second family while in one', () => {
    const u = user(UserRole.Member, 'family-a');

    expect(() => u.joinFamily('family-b', UserRole.Member)).toThrow(
      InvalidStateTransitionException,
    );
    expect(u.familyId).toBe('family-a');
  });

  it('admin accounts never join a family', () => {
    expect(() => user(UserRole.Admin).joinFamily('family-a', UserRole.Member)).toThrow(
      InvalidStateTransitionException,
    );
  });

  it('leaving resets family and role to MEMBER', () => {
    const u = user(UserRole.Homemaker, 'family-a');
    u.leaveFamily();

    expect(u.familyId).toBeNull();
    expect(u.role).toBe(UserRole.Member);
  });

  it('cannot leave when not in a family', () => {
    expect(() => user().leaveFamily()).toThrow(InvalidStateTransitionException);
  });
});

describe('User lock / unlock — FR-24', () => {
  it('toggles status and rejects no-op transitions', () => {
    const u = user();
    u.lock();
    expect(u.status).toBe(UserStatus.Locked);
    expect(() => u.lock()).toThrow(InvalidStateTransitionException);

    u.unlock();
    expect(u.status).toBe(UserStatus.Active);
    expect(() => u.unlock()).toThrow(InvalidStateTransitionException);
  });
});
