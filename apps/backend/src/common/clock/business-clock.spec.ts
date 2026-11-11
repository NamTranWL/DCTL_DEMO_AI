import { type AppConfig } from '../../config/configuration';
import { BusinessClock } from './business-clock';

describe('BusinessClock', () => {
  it('computes today in the business timezone, not UTC', () => {
    const clock = new BusinessClock({ timezone: 'Asia/Ho_Chi_Minh' } as AppConfig);
    // 2026-11-10 18:30 UTC = 2026-11-11 01:30 in Vietnam (UTC+7).
    jest.spyOn(clock, 'now').mockReturnValue(new Date('2026-11-10T18:30:00Z'));

    expect(clock.today()).toBe('2026-11-11');
  });

  it('returns the current time', () => {
    const clock = new BusinessClock({ timezone: 'UTC' } as AppConfig);

    expect(Math.abs(clock.now().getTime() - Date.now())).toBeLessThan(1000);
  });
});
