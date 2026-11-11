import { Global, Module } from '@nestjs/common';
import { BusinessClock } from './business-clock';

/** Provides BusinessClock to every module (fridge, shopping, notifications cron in B8). */
@Global()
@Module({
  providers: [BusinessClock],
  exports: [BusinessClock],
})
export class ClockModule {}
