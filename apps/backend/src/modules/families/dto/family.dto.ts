import { UserRole } from '@dctl/shared';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, IsUUID, Length, Matches } from 'class-validator';
import { type User } from '../../users/entities/user.entity';
import { type Family } from '../entities/family.entity';
import { INVITE_CODE_PATTERN, normalizeInviteCode } from '../invite-code.generator';

/** Tạo gia đình. @uc UC-FAM-01  @fr FR-03 */
export class CreateFamilyDto {
  @ApiProperty({ example: 'Nhà Minh' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value,
  )
  @IsString({ message: 'Tên gia đình phải là chuỗi.' })
  @Length(1, 100, { message: 'Tên gia đình dài từ 1 đến 100 ký tự.' })
  name!: string;
}

/** Tham gia gia đình bằng mã mời. @uc UC-FAM-01  @fr FR-03 */
export class JoinFamilyDto {
  @ApiProperty({ example: 'DEMO2026', description: '8 chữ/số, không phân biệt hoa thường' })
  @IsString({ message: 'Vui lòng nhập mã mời.' })
  @Matches(INVITE_CODE_PATTERN, { message: 'Mã mời gồm 8 chữ cái hoặc chữ số.' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeInviteCode(value) : value,
  )
  inviteCode!: string;
}

/** Chuyển quyền chủ gia đình. @uc UC-FAM-01 */
export class TransferOwnershipDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all', { message: 'Mã thành viên không hợp lệ.' })
  newOwnerId!: string;
}

/** Một thành viên trong gia đình. */
export class FamilyMemberResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  username!: string;

  @ApiProperty({ enum: UserRole })
  role!: UserRole;

  @ApiProperty()
  isOwner!: boolean;

  static from(user: User, ownerId: string): FamilyMemberResponse {
    return Object.assign(new FamilyMemberResponse(), {
      id: user.id,
      username: user.username,
      role: user.role,
      isOwner: user.id === ownerId,
    });
  }
}

/** Gia đình của người dùng hiện tại; mã mời chỉ hiển thị cho chủ gia đình. */
export class FamilyResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ format: 'uuid' })
  ownerId!: string;

  @ApiPropertyOptional({ description: 'Chỉ trả về cho chủ gia đình', example: 'DEMO2026' })
  inviteCode?: string;

  @ApiProperty({ type: [FamilyMemberResponse] })
  members!: FamilyMemberResponse[];

  @ApiProperty()
  createdAt!: Date;

  static from(family: Family, members: User[], viewerId: string): FamilyResponse {
    return Object.assign(new FamilyResponse(), {
      id: family.id,
      name: family.name,
      ownerId: family.ownerId,
      ...(family.isOwner(viewerId) ? { inviteCode: family.inviteCode } : {}),
      members: members.map((member) => FamilyMemberResponse.from(member, family.ownerId)),
      createdAt: family.createdAt,
    });
  }
}

/** Mã mời hiện tại (chủ gia đình). */
export class InviteCodeResponse {
  @ApiProperty({ example: 'K7QM2XPA' })
  inviteCode!: string;
}

/** Kết quả rời gia đình. */
export class LeaveFamilyResponse {
  @ApiProperty({
    description: 'true khi người rời là thành viên cuối cùng và gia đình bị giải tán',
  })
  dissolved!: boolean;
}
