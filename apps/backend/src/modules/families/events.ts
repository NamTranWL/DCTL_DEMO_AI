/**
 * Domain events of the families module (Observer pattern, §10).
 * Emitted by FamiliesService after the transaction commits. Listeners (B6+): the realtime
 * gateway moves sockets in/out of room `family:{id}`; notifications inform members.
 */

export const FAMILY_CREATED = 'family.created';
export const FAMILY_MEMBER_JOINED = 'family.member.joined';
export const FAMILY_MEMBER_REMOVED = 'family.member.removed';
export const FAMILY_MEMBER_LEFT = 'family.member.left';
export const FAMILY_OWNERSHIP_TRANSFERRED = 'family.ownership.transferred';
export const FAMILY_DISSOLVED = 'family.dissolved';

/** Gia đình mới được tạo; người tạo là chủ. @uc UC-FAM-01 */
export class FamilyCreatedEvent {
  constructor(
    readonly familyId: string,
    readonly ownerId: string,
  ) {}
}

/** Một người dùng đã tham gia gia đình bằng mã mời. @uc UC-FAM-01  @br BR-11 */
export class FamilyMemberJoinedEvent {
  constructor(
    readonly familyId: string,
    readonly userId: string,
  ) {}
}

/** Chủ gia đình đã xoá một thành viên. @uc UC-FAM-01  @br BR-06 */
export class FamilyMemberRemovedEvent {
  constructor(
    readonly familyId: string,
    readonly userId: string,
    readonly removedBy: string,
  ) {}
}

/** Một thành viên đã tự rời gia đình. @uc UC-FAM-01  @br BR-11 */
export class FamilyMemberLeftEvent {
  constructor(
    readonly familyId: string,
    readonly userId: string,
  ) {}
}

/** Quyền chủ gia đình đã được chuyển. @uc UC-FAM-01 */
export class FamilyOwnershipTransferredEvent {
  constructor(
    readonly familyId: string,
    readonly previousOwnerId: string,
    readonly newOwnerId: string,
  ) {}
}

/** Gia đình bị giải tán (chủ là người cuối cùng rời đi); dữ liệu gia đình đã bị xoá. */
export class FamilyDissolvedEvent {
  constructor(
    readonly familyId: string,
    readonly lastOwnerId: string,
  ) {}
}
