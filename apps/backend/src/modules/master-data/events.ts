/**
 * Domain events of the master-data module (Observer pattern, §10).
 * Emitted after the change is committed. Listener (B8): notifications sends
 * CONTENT_APPROVED / CONTENT_REJECTED to the contributor.
 */

export const FOOD_SUBMITTED = 'master-data.food.submitted';
export const FOOD_APPROVED = 'master-data.food.approved';
export const FOOD_REJECTED = 'master-data.food.rejected';
export const RECIPE_SUBMITTED = 'master-data.recipe.submitted';
export const RECIPE_APPROVED = 'master-data.recipe.approved';
export const RECIPE_REJECTED = 'master-data.recipe.rejected';

/** Một gia đình đề xuất tên thực phẩm mới (PENDING). @uc UC-FRIDGE-01  @fr FR-26  @br BR-04 */
export class FoodSubmittedEvent {
  constructor(
    readonly foodId: string,
    readonly name: string,
    readonly familyId: string,
    readonly submittedBy: string,
  ) {}
}

/** Admin đã duyệt / từ chối tên thực phẩm. @uc UC-ADM-03  @fr FR-26  @br BR-08 */
export class FoodReviewedEvent {
  constructor(
    readonly foodId: string,
    readonly name: string,
    readonly familyId: string | null,
    readonly reviewedBy: string,
    readonly reason: string | null = null,
  ) {}
}

/** Người dùng đóng góp công thức (PENDING). @uc UC-RCP-01  @fr FR-26  @br BR-08 */
export class RecipeSubmittedEvent {
  constructor(
    readonly recipeId: string,
    readonly name: string,
    readonly submittedBy: string,
  ) {}
}

/** Admin đã duyệt / từ chối công thức. @uc UC-ADM-03  @fr FR-26  @br BR-08 */
export class RecipeReviewedEvent {
  constructor(
    readonly recipeId: string,
    readonly name: string,
    readonly contributorId: string | null,
    readonly reviewedBy: string,
    readonly reason: string | null = null,
  ) {}
}
