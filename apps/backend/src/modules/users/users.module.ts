import { Module } from '@nestjs/common';
import { DietaryProfileService } from './dietary-profile.service';
import { DietaryProfileRepository } from './repositories/dietary-profile.repository';
import { UserRepository } from './repositories/user.repository';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

/**
 * Module users: tài khoản và hồ sơ ăn uống (UC-AUTH-01/02, UC-FAM-02).
 * Exports UsersService/DietaryProfileService for auth, families and ai, and UserRepository
 * for families (membership changes run inside one transaction).
 */
@Module({
  controllers: [UsersController],
  providers: [UsersService, DietaryProfileService, UserRepository, DietaryProfileRepository],
  exports: [UsersService, DietaryProfileService, UserRepository],
})
export class UsersModule {}
