/**
 * Business constants and value types shared by backend and mobile.
 */

/**
 * BR-01: một mục "sắp hết hạn" khi 0 < expiryDate − hômNay ≤ EXPIRY_SOON_DAYS;
 * "hết hạn" khi expiryDate − hômNay ≤ 0.
 */
export const EXPIRY_SOON_DAYS = 3;

/**
 * One allergy in dietary_profiles.allergies (jsonb array).
 * Matched by foodId when present, otherwise by normalized name (BR-07).
 */
export interface AllergyEntry {
  /** foods.id when the allergen is a known food. */
  foodId?: string;
  /** Display name, e.g. "Tôm". */
  name: string;
}

/** Nutrition facts per serving stored in recipes.nutrition_info (jsonb). */
export interface NutritionInfo {
  servings: number;
  caloriesKcal?: number;
  proteinG?: number;
  fatG?: number;
  carbsG?: number;
  /** Data source — required by the topic when showing nutrition (bonus feature). */
  source: string;
}
