import { normalizeFoodName, toSearchKey } from '@dctl/shared';

/** Tests for the text helpers of @dctl/shared (used by backend, mobile and the AI module). */
describe('normalizeFoodName — BR-04', () => {
  it.each([
    ['  cà  CHUA ', 'Cà chua'],
    ['THỊT ba chỉ', 'Thịt ba chỉ'],
    ['đậu phụ', 'Đậu phụ'],
    ['ớt\u200b chuông', 'Ớt chuông'],
    ['ca\u0300 chua', 'Cà chua'],
    ['   ', ''],
  ])('%p → %p', (input, expected) => {
    expect(normalizeFoodName(input)).toBe(expected);
  });

  it('keeps diacritics, so "Cá" and "Cà" stay different foods', () => {
    expect(normalizeFoodName('cá')).not.toBe(normalizeFoodName('cà'));
  });
});

describe('toSearchKey — accent/case-insensitive search', () => {
  it.each([
    ['Thịt Ba Chỉ', 'thit ba chi'],
    ['ĐẬU PHỤ', 'dau phu'],
    ['  Nước   mắm ', 'nuoc mam'],
    ['Ớt', 'ot'],
  ])('%p → %p', (input, expected) => {
    expect(toSearchKey(input)).toBe(expected);
  });
});
