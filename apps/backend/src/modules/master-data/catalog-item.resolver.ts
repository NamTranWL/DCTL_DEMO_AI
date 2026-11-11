import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCode } from '../../common/exceptions/error-code.enum';
import { CategoriesService } from './categories.service';
import { type Category } from './entities/category.entity';
import { type Food } from './entities/food.entity';
import { type Unit } from './entities/unit.entity';
import { FoodsService } from './foods.service';
import { UnitsService } from './units.service';

/** What a client sends for one shopping item / fridge entry (names already normalized). */
export interface CatalogItemInput {
  foodId?: string | null;
  name?: string | null;
  categoryId?: string | null;
  unitId: string;
}

/** A validated item: food/category/unit exist and the family may use the food (BR-04). */
export interface ResolvedCatalogItem {
  foodId: string | null;
  name: string;
  categoryId: string;
  unitId: string;
  category: Category;
  unit: Unit;
}

interface FieldError {
  field: string;
  constraints: Record<string, string>;
}

/**
 * Kiểm tra tham chiếu master data của mặt hàng mua sắm / lô nhập kho theo BR-04:
 * - có foodId → thực phẩm phải APPROVED hoặc PENDING của chính gia đình; tên lấy theo tên chuẩn,
 *   danh mục mặc định theo thực phẩm;
 * - không có foodId → bắt buộc tên + danh mục; tên trùng khớp (sau chuẩn hoá) một thực phẩm
 *   gia đình được dùng thì tự gắn food_id, ngược lại lưu tên tự do với food_id = NULL (§11).
 *   Tên mới không tự tạo `foods`: app gọi POST /foods/contribute (B5) nếu muốn đề xuất.
 * - đơn vị, danh mục phải tồn tại.
 * Dùng chung cho module shopping và fridge (B7).
 * @uc UC-SHOP-01, UC-FRIDGE-01  @fr FR-05, FR-09  @br BR-04, BR-06
 */
@Injectable()
export class CatalogItemResolver {
  constructor(
    private readonly foodsService: FoodsService,
    private readonly categoriesService: CategoriesService,
    private readonly unitsService: UnitsService,
  ) {}

  /**
   * Kiểm tra và chuẩn hoá danh sách mặt hàng; lỗi trả về theo vị trí (`items.2.unitId`).
   * @uc UC-SHOP-01, UC-FRIDGE-01  @fr FR-05, FR-09  @br BR-04
   */
  async resolve(
    familyId: string,
    inputs: readonly CatalogItemInput[],
    field = 'items',
  ): Promise<ResolvedCatalogItem[]> {
    const foodIds = inputs.flatMap((i) => (i.foodId ? [i.foodId] : []));
    const freeNames = inputs.flatMap((i) => (!i.foodId && i.name ? [i.name] : []));

    const [byId, byName] = await Promise.all([
      this.foodsService.findUsable(familyId, foodIds),
      this.foodsService.findUsableByNames(familyId, freeNames),
    ]);
    const foodsById = new Map(byId.map((f) => [f.id, f]));
    const foodsByName = new Map(byName.map((f) => [f.name, f]));

    const unavailable = foodIds.filter((id) => !foodsById.has(id));
    if (unavailable.length > 0) {
      throw new AppException(ErrorCode.FoodNotAvailable, undefined, HttpStatus.BAD_REQUEST, {
        foodIds: [...new Set(unavailable)],
      });
    }

    const errors: FieldError[] = [];
    const drafts = inputs.map((input, index) => {
      const food: Food | undefined = input.foodId
        ? foodsById.get(input.foodId)
        : foodsByName.get(input.name ?? '');
      const name = food?.name ?? input.name ?? '';
      const categoryId = input.categoryId ?? food?.categoryId ?? null;
      if (name.length === 0) {
        errors.push(this.error(field, index, 'name', 'Vui lòng nhập tên hoặc chọn thực phẩm.'));
      }
      if (categoryId === null) {
        errors.push(this.error(field, index, 'categoryId', 'Vui lòng chọn danh mục.'));
      }
      return { foodId: food?.id ?? null, name, categoryId: categoryId ?? '', unitId: input.unitId };
    });
    if (errors.length > 0) {
      throw AppException.validation(errors);
    }

    const [categories, units] = await Promise.all([
      this.categoriesService.findMany(drafts.map((d) => d.categoryId)),
      this.unitsService.findMany(drafts.map((d) => d.unitId)),
    ]);
    const categoriesById = new Map(categories.map((c) => [c.id, c]));
    const unitsById = new Map(units.map((u) => [u.id, u]));

    const resolved: ResolvedCatalogItem[] = [];
    drafts.forEach((draft, index) => {
      const category = categoriesById.get(draft.categoryId);
      const unit = unitsById.get(draft.unitId);
      if (!category) {
        errors.push(this.error(field, index, 'categoryId', 'Danh mục không tồn tại.'));
      }
      if (!unit) {
        errors.push(this.error(field, index, 'unitId', 'Đơn vị không tồn tại.'));
      }
      if (category && unit) {
        resolved.push({ ...draft, category, unit });
      }
    });
    if (errors.length > 0) {
      throw AppException.validation(errors);
    }
    return resolved;
  }

  private error(field: string, index: number, key: string, message: string): FieldError {
    return { field: `${field}.${index}.${key}`, constraints: { exists: message } };
  }
}
