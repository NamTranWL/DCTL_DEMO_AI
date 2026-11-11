import { UserRole } from '@dctl/shared';
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  CurrentFamilyId,
  CurrentUser,
  RequireFamily,
  Roles,
} from '../../common/decorators/auth.decorators';
import { uuidParam } from '../../common/pipes/uuid.pipe';
import { type AuthUser } from '../../common/types/auth-user';
import { ApiTag, BEARER_AUTH } from '../../config/swagger.config';
import {
  CreateFamilyDto,
  FamilyResponse,
  InviteCodeResponse,
  JoinFamilyDto,
  LeaveFamilyResponse,
  TransferOwnershipDto,
} from './dto/family.dto';
import { FamiliesService } from './families.service';

const MEMBER_ID_PIPE = uuidParam('userId', 'Mã thành viên không hợp lệ.');

/**
 * Nhóm gia đình của người dùng đang đăng nhập. Mọi thao tác trên gia đình dùng `/me` —
 * family_id lấy từ phiên đăng nhập, không bao giờ từ client (BR-06).
 * Sau khi tạo/tham gia/rời gia đình, client gọi POST /auth/refresh để nhận token có
 * familyId mới (API luôn dùng familyId theo DB nên vẫn an toàn trước khi refresh).
 * @uc UC-FAM-01  @fr FR-03  @br BR-06, BR-11
 */
@ApiTags(ApiTag.Families)
@ApiBearerAuth(BEARER_AUTH)
@Controller('families')
export class FamiliesController {
  constructor(private readonly familiesService: FamiliesService) {}

  /** Tạo gia đình (người tạo là chủ, vai trò nội trợ). @uc UC-FAM-01  @fr FR-03  @br BR-11 */
  @Post()
  @ApiCreatedResponse({ type: FamilyResponse })
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateFamilyDto,
  ): Promise<FamilyResponse> {
    const family = await this.familiesService.createFamily(user.id, dto.name);
    const { members } = await this.familiesService.getMyFamily(family.id);
    return FamilyResponse.from(family, members, user.id);
  }

  /** Tham gia gia đình bằng mã mời. @uc UC-FAM-01  @fr FR-03  @br BR-11 */
  @Post('join')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: FamilyResponse })
  async join(@CurrentUser() user: AuthUser, @Body() dto: JoinFamilyDto): Promise<FamilyResponse> {
    const family = await this.familiesService.joinByInviteCode(user.id, dto.inviteCode);
    const { members } = await this.familiesService.getMyFamily(family.id);
    return FamilyResponse.from(family, members, user.id);
  }

  /** Xem gia đình của tôi và các thành viên. @uc UC-FAM-01  @fr FR-03  @br BR-06 */
  @Get('me')
  @RequireFamily()
  @ApiOkResponse({ type: FamilyResponse })
  async getMine(
    @CurrentUser() user: AuthUser,
    @CurrentFamilyId() familyId: string,
  ): Promise<FamilyResponse> {
    const { family, members } = await this.familiesService.getMyFamily(familyId);
    return FamilyResponse.from(family, members, user.id);
  }

  /** Đổi mã mời (chủ gia đình). @uc UC-FAM-01  @fr FR-03 */
  @Post('me/invite-code')
  @RequireFamily()
  @Roles(UserRole.Homemaker)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: InviteCodeResponse })
  async regenerateInviteCode(
    @CurrentUser() user: AuthUser,
    @CurrentFamilyId() familyId: string,
  ): Promise<InviteCodeResponse> {
    return { inviteCode: await this.familiesService.regenerateInviteCode(user.id, familyId) };
  }

  /** Xoá thành viên khỏi gia đình (chủ gia đình). @uc UC-FAM-01  @fr FR-03  @br BR-06 */
  @Delete('me/members/:userId')
  @RequireFamily()
  @Roles(UserRole.Homemaker)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async removeMember(
    @CurrentUser() user: AuthUser,
    @CurrentFamilyId() familyId: string,
    @Param('userId', MEMBER_ID_PIPE) memberId: string,
  ): Promise<void> {
    await this.familiesService.removeMember(user.id, familyId, memberId);
  }

  /** Chuyển quyền chủ gia đình. @uc UC-FAM-01  @fr FR-03 */
  @Post('me/transfer-ownership')
  @RequireFamily()
  @Roles(UserRole.Homemaker)
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: FamilyResponse })
  async transferOwnership(
    @CurrentUser() user: AuthUser,
    @CurrentFamilyId() familyId: string,
    @Body() dto: TransferOwnershipDto,
  ): Promise<FamilyResponse> {
    const family = await this.familiesService.transferOwnership(user.id, familyId, dto.newOwnerId);
    const { members } = await this.familiesService.getMyFamily(familyId);
    return FamilyResponse.from(family, members, user.id);
  }

  /** Rời gia đình (chủ là người cuối cùng → giải tán). @uc UC-FAM-01  @fr FR-03  @br BR-11 */
  @Post('me/leave')
  @RequireFamily()
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: LeaveFamilyResponse })
  leave(@CurrentUser() user: AuthUser): Promise<LeaveFamilyResponse> {
    return this.familiesService.leaveFamily(user.id);
  }
}
