import { type DefaultJobOptions } from 'bullmq';

/** BullMQ queue names. Each queue has one processor in its owning feature module. */
export const QUEUE_NAMES = {
  /** Push/Email delivery (FR-10) — processed by NotificationsProcessor. */
  NOTIFICATIONS: 'notifications',
} as const;

/** Redis key prefix of every BullMQ key (`dctl:notifications:…`). */
export const QUEUE_PREFIX = 'dctl';

/**
 * Defaults for every job: 3 attempts with exponential back-off (2 s, 4 s), keep the last
 * 1 000 completed jobs and 7 days of failed jobs for monitoring (FR-27, NFR §9 reliability).
 */
export const DEFAULT_JOB_OPTIONS: DefaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: { count: 1000 },
  removeOnFail: { age: 7 * 24 * 3600 },
};
