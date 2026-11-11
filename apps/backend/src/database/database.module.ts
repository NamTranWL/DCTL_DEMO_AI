import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { type Env } from '../config/env.validation';
import { buildDataSourceOptions } from './typeorm.options';

/**
 * Registers the TypeORM connection using the shared option builder.
 * Feature modules declare their repositories with `TypeOrmModule.forFeature([...])`.
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        buildDataSourceOptions({
          DB_HOST: config.get('DB_HOST', { infer: true }),
          DB_PORT: config.get('DB_PORT', { infer: true }),
          DB_USERNAME: config.get('DB_USERNAME', { infer: true }),
          DB_PASSWORD: config.get('DB_PASSWORD', { infer: true }),
          DB_NAME: config.get('DB_NAME', { infer: true }),
          DB_LOGGING: config.get('DB_LOGGING', { infer: true }),
          APP_TIMEZONE: config.get('APP_TIMEZONE', { infer: true }),
        }),
    }),
  ],
})
export class DatabaseModule {}
