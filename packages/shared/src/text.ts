/**
 * Text normalization shared by backend (storage, matching, AI — §8) and mobile (autocomplete).
 * Keep these pure and dependency-free: the same input must give the same output everywhere.
 */

/** Combining diacritical marks (U+0300–U+036F) left after NFD decomposition. */
const COMBINING_MARKS = /[\u0300-\u036f]/g;
/** Zero-width and BOM characters that sneak in from copy/paste. */
const INVISIBLE = /[\u200b-\u200d\u2060\ufeff]/g;
const WHITESPACE = /\s+/g;

function collapse(value: string): string {
  return value.normalize('NFC').replace(INVISIBLE, '').replace(WHITESPACE, ' ').trim();
}

/**
 * Chuẩn hoá tên thực phẩm trước khi lưu/so khớp (BR-04, §8 IngredientMatcher):
 * Unicode NFC, bỏ ký tự ẩn, gộp khoảng trắng, viết hoa chữ cái đầu, còn lại chữ thường.
 *   "  cà  CHUA " → "Cà chua"      "THỊT ba chỉ" → "Thịt ba chỉ"
 * Giữ nguyên dấu tiếng Việt ("Cá" ≠ "Cà") — so khớp không dấu dùng toSearchKey().
 */
export function normalizeFoodName(raw: string): string {
  const lower = collapse(raw).toLocaleLowerCase('vi');
  if (lower.length === 0) {
    return '';
  }
  const first = lower.charAt(0).toLocaleUpperCase('vi');
  return `${first}${lower.slice(1)}`;
}

/**
 * Khoá tìm kiếm không dấu, không phân biệt hoa thường: "Thịt Ba Chỉ" → "thit ba chi",
 * "Đậu phụ" → "dau phu". Dùng cho ô gợi ý tên thực phẩm và đối chiếu nguyên liệu.
 * Tương đương `lower(unaccent(x))` của PostgreSQL với chữ tiếng Việt.
 */
export function toSearchKey(raw: string): string {
  return collapse(raw)
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}
