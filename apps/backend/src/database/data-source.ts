/**
 * TypeORM DataSource for the CLI (migration:generate / run / revert) and the seed runner.
 * Loads apps/backend/.env, validates it with the same schema as the app, then
 * builds options with the shared builder — the app and CLI cannot drift apart.
 */
import 'reflect-metadata';
import { config as loadDotenv } from 'dotenv';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { validateEnv } from '../config/env.validation';
import { buildDataSourceOptions } from './typeorm.options';

loadDotenv({ path: join(__dirname, '..', '..', '.env'), quiet: true });

const AppDataSource = new DataSource(buildDataSourceOptions(validateEnv(process.env)));

export default AppDataSource;
