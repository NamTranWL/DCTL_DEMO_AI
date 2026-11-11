/**
 * Calendar-date helpers. Business dates (expiry_date, target_date, meal dates) are stored as
 * PostgreSQL `date` and handled as ISO strings 'YYYY-MM-DD' to avoid timezone shifts.
 * "Today" is always computed in the business timezone (APP_TIMEZONE, Asia/Ho_Chi_Minh).
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;

/** ISO calendar date (YYYY-MM-DD). */
export type IsoDate = string;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

/** Today's calendar date in the given IANA timezone. */
export function todayIn(timeZone: string, now: Date = new Date()): IsoDate {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function toUtcMidnight(date: IsoDate): number {
  if (!isIsoDate(date)) {
    throw new Error(`Invalid ISO date: ${date}`);
  }
  return Date.parse(`${date}T00:00:00Z`);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtcMidnight(to) - toUtcMidnight(from)) / MS_PER_DAY);
}

/** `date` shifted by `days` calendar days. */
export function addDays(date: IsoDate, days: number): IsoDate {
  return new Date(toUtcMidnight(date) + days * MS_PER_DAY).toISOString().slice(0, 10);
}
