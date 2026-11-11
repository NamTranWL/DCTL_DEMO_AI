import { validateSync } from 'class-validator';
import { IsIsoDate } from './is-iso-date.validator';

class Probe {
  @IsIsoDate()
  date!: unknown;
}

function errorsFor(date: unknown): number {
  const probe = new Probe();
  probe.date = date;
  return validateSync(probe).length;
}

describe('IsIsoDate', () => {
  it.each(['2026-11-11', '2028-02-29'])('accepts %s', (value) => {
    expect(errorsFor(value)).toBe(0);
  });

  it.each(['2026-02-30', '2026-13-01', '11/11/2026', '2026-11-11T00:00:00Z', 20261111, null])(
    'rejects %p',
    (value) => {
      expect(errorsFor(value)).toBe(1);
    },
  );
});
