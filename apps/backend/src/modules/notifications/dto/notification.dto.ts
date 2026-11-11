import { PushPlatform } from '@dctl/shared';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
} from 'class-validator';
import { NotificationChannel } from '../notification.types';

/** Expo push token format: ExponentPushToken[…] or ExpoPushToken[…]. */
export const EXPO_PUSH_TOKEN_PATTERN = /^Expo(nent)?PushToken\[[^\]]+\]$/;

/** Đăng ký push token của thiết bị. @uc UC-FRIDGE-04  @fr FR-10 */
export class RegisterPushTokenDto {
  @ApiProperty({ example: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]' })
  @IsString({ message: 'Push token phải là chuỗi.' })
  @Matches(EXPO_PUSH_TOKEN_PATTERN, { message: 'Push token không đúng định dạng Expo.' })
  token!: string;

  @ApiProperty({ enum: PushPlatform })
  @IsEnum(PushPlatform, { message: 'Nền tảng không hợp lệ.' })
  platform!: PushPlatform;
}

/** Huỷ đăng ký push token. @uc UC-FRIDGE-04  @fr FR-10 */
export class UnregisterPushTokenDto {
  @ApiProperty({ example: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]' })
  @IsString({ message: 'Push token phải là chuỗi.' })
  @Length(1, 255, { message: 'Push token không hợp lệ.' })
  token!: string;
}

/** Admin gửi thông báo thử qua hàng đợi (kiểm tra cấu hình Email/Push). */
export class SendTestNotificationDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Mặc định: chính Admin' })
  @IsOptional()
  @IsUUID('all', { message: 'Mã người dùng không hợp lệ.' })
  userId?: string;

  @ApiPropertyOptional({ enum: NotificationChannel, isArray: true, default: ['EMAIL', 'PUSH'] })
  @IsOptional()
  @IsArray({ message: 'Kênh gửi phải là mảng.' })
  @ArrayMinSize(1, { message: 'Chọn ít nhất một kênh.' })
  @ArrayUnique({ message: 'Kênh gửi bị trùng.' })
  @IsEnum(NotificationChannel, { each: true, message: 'Kênh gửi không hợp lệ.' })
  channels?: NotificationChannel[];
}

export class SendTestNotificationResponse {
  @ApiProperty({ type: [String] }) jobIds!: string[];
}
