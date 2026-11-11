import { addDays, daysBetween, isIsoDate, todayIn } from './date.util';

describe('date.util', () => {
  it('computes "today" in the business timezone, not UTC', () => {
    // 2026-11-04 18:30 UTC is already 2026-11-05 01:30 in Asia/Ho_Chi_Minh (UTC+7).
    const now = new Date('2026-11-04T18:30:00Z');

    expect(todayIn('Asia/Ho_Chi_Minh', now)).toBe('2026-11-05');
    expect(todayIn('UTC', now)).toBe('2026-11-04');
  });

  it('counts whole days between dates (negative when earlier)', () => {
    expect(daysBetween('2026-11-05', '2026-11-08')).toBe(3);
    expect(daysBetween('2026-11-05', '2026-11-05')).toBe(0);
    expect(daysBetween('2026-11-05', '2026-11-04')).toBe(-1);
  });

  it('handles month and leap-year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2);
  });

  it('validates ISO dates strictly', () => {
    expect(isIsoDate('2026-11-05')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('05/11/2026')).toBe(false);
    expect(() => daysBetween('2026-13-01', '2026-11-05')).toThrow(/Invalid ISO date/);
  });
});
