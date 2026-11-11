import { type AuthUser } from '../../common/types/auth-user';

/**
 * Who is looking at master data. Decides visibility of user-contributed content (BR-04, BR-08):
 * APPROVED is public; PENDING/REJECTED is visible only to the contributor's family.
 */
export interface Viewer {
  userId: string;
  familyId: string | null;
}

export function viewerOf(user: Pick<AuthUser, 'id' | 'familyId'>): Viewer {
  return { userId: user.id, familyId: user.familyId };
}

/** How many rows of other tables still reference a master-data row. */
export interface UsageCount {
  fridgeItems: number;
  shoppingListItems: number;
  recipeIngredients: number;
}

export function totalUsage(usage: UsageCount): number {
  return usage.fridgeItems + usage.shoppingListItems + usage.recipeIngredients;
}

/**
 * Source note stored in recipes.nutrition_info when no figures are given: no nutrition data
 * is invented (the topic requires citing the data source).
 */
export const NUTRITION_SOURCE_PENDING =
  'Chưa cập nhật số liệu — bổ sung từ Bảng thành phần thực phẩm Việt Nam (Viện Dinh dưỡng Quốc gia).';
