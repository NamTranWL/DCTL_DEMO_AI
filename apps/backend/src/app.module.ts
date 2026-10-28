import { Module } from '@nestjs/common';

/**
 * Root module of the backend.
 * Feature modules from PROJECT_CONTEXT.md §10 (auth, users, families, master-data, fridge,
 * shopping, meal-plan, ai, notifications, reports, admin) are registered here from B2 onward.
 */
@Module({})
export class AppModule {}
