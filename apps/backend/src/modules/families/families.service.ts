import { UserRole } from '@dctl/shared';
import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource, type EntityManager } from 'typeorm';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCode } from '../../common/exceptions/error-code.enum';
import { type User } from '../users/entities/user.entity';
import { UserRepository } from '../users/repositories/user.repository';
import { type Family } from './entities/family.entity';
import {
  FAMILY_CREATED,
  FAMILY_DISSOLVED,
  FAMILY_MEMBER_JOINED,
  FAMILY_MEMBER_LEFT,
  FAMILY_MEMBER_REMOVED,
  FAMILY_OWNERSHIP_TRANSFERRED,
  FamilyCreatedEvent,
  FamilyDissolvedEvent,
  FamilyMemberJoinedEvent,
  FamilyMemberLeftEvent,
  FamilyMemberRemovedEvent,
  FamilyOwnershipTransferredEvent,
} from './events';
import { InviteCodeGenerator } from './invite-code.generator';
import { FamilyRepository } from './repositories/family.repository';

/** Retries when a freshly generated invite code collides with an existing one. */
const INVITE_CODE_ATTEMPTS = 5;

/** A family with its members, as returned to the current user. */
export interface FamilyWithMembers {
  family: Family;
  members: User[];
}

/** Outcome of leaving a family. */
export interface LeaveResult {
  /** True when the leaver was the last member and the family was deleted. */
  dissolved: boolean;
}

/**
 * Quản lý nhóm gia đình: tạo, mã mời, tham gia, xoá thành viên, rời, chuyển quyền chủ.
 * Mọi thay đổi thành viên chạy trong transaction có khoá dòng người dùng, đảm bảo mỗi người
 * chỉ thuộc tối đa một gia đình kể cả khi gửi yêu cầu song song (BR-11). family_id luôn lấy
 * từ người dùng đang đăng nhập (BR-06).
 * @uc UC-FAM-01  @fr FR-03  @br BR-06, BR-11
 */
@Injectable()
export class FamiliesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly families: FamilyRepository,
    private readonly users: UserRepository,
    private readonly inviteCodes: InviteCodeGenerator,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Tạo gia đình; người tạo trở thành chủ gia đình với vai trò HOMEMAKER.
   * @uc UC-FAM-01  @fr FR-03  @br BR-11
   */
  async createFamily(userId: string, name: string): Promise<Family> {
    const family = await this.dataSource.transaction(async (manager) => {
      const users = this.users.withManager(manager);
      const families = this.families.withManager(manager);
      const user = await this.lockUser(users, userId);
      this.assertNoFamily(user);

      const created = await families.save(
        families.create({
          name,
          ownerId: user.id,
          inviteCode: await this.uniqueInviteCode(families),
        }),
      );
      user.joinFamily(created.id, UserRole.Homemaker);
      await users.save(user);
      return created;
    });
    this.events.emit(FAMILY_CREATED, new FamilyCreatedEvent(family.id, family.ownerId));
    return family;
  }

  /**
   * Gia đình hiện tại của người dùng kèm danh sách thành viên.
   * @uc UC-FAM-01  @fr FR-03  @br BR-06
   */
  async getMyFamily(familyId: string): Promise<FamilyWithMembers> {
    const family = await this.families.findOneBy({ id: familyId });
    if (!family) {
      throw new AppException(ErrorCode.FamilyRequired, undefined, HttpStatus.FORBIDDEN);
    }
    return { family, members: await this.users.findFamilyMembers(familyId) };
  }

  /**
   * Đổi mã mời (chỉ chủ gia đình); mã cũ hết hiệu lực ngay.
   * @uc UC-FAM-01  @fr FR-03
   */
  async regenerateInviteCode(userId: string, familyId: string): Promise<string> {
    return this.dataSource.transaction(async (manager) => {
      const families = this.families.withManager(manager);
      const family = await this.lockFamily(families, familyId);
      this.assertOwner(family, userId);
      family.rotateInviteCode(await this.uniqueInviteCode(families));
      await families.save(family);
      return family.inviteCode;
    });
  }

  /**
   * Tham gia gia đình bằng mã mời với vai trò MEMBER. Đang thuộc gia đình khác → 409.
   * @uc UC-FAM-01  @fr FR-03  @br BR-11
   */
  async joinByInviteCode(userId: string, inviteCode: string): Promise<Family> {
    const family = await this.dataSource.transaction(async (manager) => {
      const users = this.users.withManager(manager);
      const user = await this.lockUser(users, userId);
      this.assertNoFamily(user);

      const target = await this.families.withManager(manager).findByInviteCode(inviteCode);
      if (!target) {
        throw new AppException(ErrorCode.InviteCodeInvalid, undefined, HttpStatus.NOT_FOUND);
      }
      user.joinFamily(target.id, UserRole.Member);
      await users.save(user);
      return target;
    });
    this.events.emit(FAMILY_MEMBER_JOINED, new FamilyMemberJoinedEvent(family.id, userId));
    return family;
  }

  /**
   * Chủ gia đình xoá một thành viên. Thành viên phải thuộc CÙNG gia đình của người gọi
   * (id của gia đình khác → 404, không lộ thông tin). Không tự xoá mình.
   * @uc UC-FAM-01  @fr FR-03  @br BR-06, BR-11
   */
  async removeMember(ownerId: string, familyId: string, memberId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const family = await this.lockFamily(this.families.withManager(manager), familyId);
      this.assertOwner(family, ownerId);
      if (memberId === ownerId) {
        throw new AppException(ErrorCode.CannotRemoveSelf, undefined, HttpStatus.BAD_REQUEST);
      }
      const users = this.users.withManager(manager);
      const member = await this.lockFamilyMember(users, familyId, memberId);
      member.leaveFamily();
      await users.save(member);
    });
    this.events.emit(
      FAMILY_MEMBER_REMOVED,
      new FamilyMemberRemovedEvent(familyId, memberId, ownerId),
    );
  }

  /**
   * Chuyển quyền chủ gia đình cho một thành viên khác; người nhận có vai trò HOMEMAKER.
   * @uc UC-FAM-01  @fr FR-03
   */
  async transferOwnership(ownerId: string, familyId: string, newOwnerId: string): Promise<Family> {
    const family = await this.dataSource.transaction(async (manager) => {
      const families = this.families.withManager(manager);
      const target = await this.lockFamily(families, familyId);
      this.assertOwner(target, ownerId);

      const users = this.users.withManager(manager);
      const newOwner = await this.lockFamilyMember(users, familyId, newOwnerId);
      target.transferOwnershipTo(newOwner.id);
      newOwner.role = UserRole.Homemaker;
      await users.save(newOwner);
      return families.save(target);
    });
    this.events.emit(
      FAMILY_OWNERSHIP_TRANSFERRED,
      new FamilyOwnershipTransferredEvent(familyId, ownerId, newOwnerId),
    );
    return family;
  }

  /**
   * Rời gia đình. Thành viên thường rời ngay. Chủ gia đình: còn thành viên khác → phải chuyển
   * quyền trước (409); là người cuối cùng → gia đình bị giải tán, dữ liệu gia đình bị xoá.
   * @uc UC-FAM-01  @fr FR-03  @br BR-11
   */
  async leaveFamily(userId: string): Promise<LeaveResult> {
    const outcome = await this.dataSource.transaction(async (manager) => {
      const users = this.users.withManager(manager);
      // Lock order is always family → user (same as removeMember/transfer) to avoid deadlocks.
      const current = await users.findOneBy({ id: userId });
      if (!current?.familyId) {
        throw new AppException(ErrorCode.FamilyRequired, undefined, HttpStatus.FORBIDDEN);
      }
      const familyId = current.familyId;
      const families = this.families.withManager(manager);
      const family = await this.lockFamily(families, familyId);
      const user = await this.lockUser(users, userId);
      if (user.familyId !== familyId) {
        // Membership changed concurrently (e.g. removed by the owner meanwhile).
        throw new AppException(ErrorCode.FamilyRequired, undefined, HttpStatus.FORBIDDEN);
      }

      if (!family.isOwner(userId)) {
        user.leaveFamily();
        await users.save(user);
        return { familyId, dissolved: false };
      }
      if ((await users.countFamilyMembers(familyId)) > 1) {
        throw new AppException(ErrorCode.OwnerMustTransfer, undefined, HttpStatus.CONFLICT);
      }
      user.leaveFamily();
      await users.save(user);
      await this.dissolve(manager, family);
      return { familyId, dissolved: true };
    });

    if (outcome.dissolved) {
      this.events.emit(FAMILY_DISSOLVED, new FamilyDissolvedEvent(outcome.familyId, userId));
    } else {
      this.events.emit(FAMILY_MEMBER_LEFT, new FamilyMemberLeftEvent(outcome.familyId, userId));
    }
    return { dissolved: outcome.dissolved };
  }

  /** Delete the family row; fridge, shopping lists and meal plans cascade (§11). */
  private async dissolve(manager: EntityManager, family: Family): Promise<void> {
    await this.families.withManager(manager).delete({ id: family.id });
  }

  private async lockUser(users: UserRepository, userId: string): Promise<User> {
    const user = await users.findByIdForUpdate(userId);
    if (!user) {
      throw AppException.notFound('Không tìm thấy tài khoản.');
    }
    return user;
  }

  private async lockFamily(families: FamilyRepository, familyId: string): Promise<Family> {
    const family = await families.findByIdForUpdate(familyId);
    if (!family) {
      throw new AppException(ErrorCode.FamilyRequired, undefined, HttpStatus.FORBIDDEN);
    }
    return family;
  }

  /** A user of THIS family, locked; any other id (other family, unknown) → 404. @br BR-06 */
  private async lockFamilyMember(
    users: UserRepository,
    familyId: string,
    memberId: string,
  ): Promise<User> {
    const member = await users.findByIdForUpdate(memberId);
    if (!member || member.familyId !== familyId) {
      throw new AppException(ErrorCode.MemberNotFound, undefined, HttpStatus.NOT_FOUND);
    }
    return member;
  }

  private assertNoFamily(user: User): void {
    if (user.hasFamily()) {
      throw new AppException(ErrorCode.AlreadyInFamily, undefined, HttpStatus.CONFLICT);
    }
  }

  private assertOwner(family: Family, userId: string): void {
    if (!family.isOwner(userId)) {
      throw new AppException(ErrorCode.NotFamilyOwner, undefined, HttpStatus.FORBIDDEN);
    }
  }

  private async uniqueInviteCode(families: FamilyRepository): Promise<string> {
    for (let attempt = 0; attempt < INVITE_CODE_ATTEMPTS; attempt++) {
      const code = this.inviteCodes.generate();
      if (!(await families.existsByInviteCode(code))) {
        return code;
      }
    }
    throw new Error('Could not generate a unique invite code');
  }
}
