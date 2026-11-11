import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { FamiliesController } from './families.controller';
import { FamiliesService } from './families.service';
import { InviteCodeGenerator } from './invite-code.generator';
import { FamilyRealtimeListener } from './listeners/family-realtime.listener';
import { FamilyRepository } from './repositories/family.repository';

/** Module families: nhóm gia đình, mã mời, thành viên (UC-FAM-01, BR-06, BR-11). */
@Module({
  imports: [UsersModule],
  controllers: [FamiliesController],
  providers: [FamiliesService, FamilyRepository, InviteCodeGenerator, FamilyRealtimeListener],
  exports: [FamiliesService],
})
export class FamiliesModule {}
