import { UserRole, UserStatus } from '@dctl/shared';
import { ApiProperty } from '@nestjs/swagger';
import { type User } from '../entities/user.entity';

/** Thông tin tài khoản trả về cho client (không bao giờ chứa password_hash). */
export class UserResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'noitro' })
  username!: string;

  @ApiProperty({ example: 'noitro@dctl.local' })
  email!: string;

  @ApiProperty({ enum: UserRole })
  role!: UserRole;

  @ApiProperty({ enum: UserStatus })
  status!: UserStatus;

  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  familyId!: string | null;

  @ApiProperty()
  createdAt!: Date;

  static from(user: User): UserResponse {
    return Object.assign(new UserResponse(), {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      status: user.status,
      familyId: user.familyId,
      createdAt: user.createdAt,
    });
  }
}
