import { ApprovalStatus, toSearchKey } from '@dctl/shared';
import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCode } from '../../common/exceptions/error-code.enum';
import { uniqueViolationConstraint } from '../../common/utils/db-error.util';
import { CategoriesService } from './categories.service';
import {
  type AdminFoodsQueryDto,
  type ContributeFoodDto,
  type CreateFoodDto,
  type SearchFoodsQueryDto,
  type UpdateFoodDto,
} from './dto/food.dto';
import { type Food } from './entities/food.entity';
import {
  FOOD_APPROVED,
  FOOD_REJECTED,
  FOOD_SUBMITTED,
  FoodReviewedEvent,
  FoodSubmittedEvent,
} from './events';
import { totalUsage, type Viewer } from './master-data.types';
import { FoodRepository } from './repositories/food.repository';

/** Result of a contribution: the food and whether a new PENDING row was created. */
export interface ContributeResult {
  food: Food;
  created: boolean;
}

/**
 * Danh mục tên thực phẩm chuẩn (foods): tra cứu không dấu cho ô gợi ý, người dùng đề xuất
 * tên mới (PENDING), Admin quản lý và kiểm duyệt.
 * @uc UC-FRIDGE-01, UC-ADM-02, UC-ADM-03  @fr FR-09, FR-25, FR-26  @br BR-04, BR-08
 */
@Injectable()
export class FoodsService {
  constructor(
    private readonly foods: FoodRepository,
    private readonly categoriesService: CategoriesService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Gợi ý tên thực phẩm theo từ khoá (không dấu, không phân biệt hoa thường).
   * Chỉ trả APPROVED + PENDING do chính gia đình người dùng tạo.
   * @uc UC-FRIDGE-01, UC-SHOP-01  @fr FR-09, FR-12  @br BR-04
   */
  search(familyId: string | null, query: SearchFoodsQueryDto): Promise<Food[]> {
    const key = toSearchKey(query.q);
    if (key.length === 0) {
      return Promise.resolve([]);
    }
    return this.foods.searchVisible({
      key,
      familyId,
      categoryId: query.categoryId,
      limit: query.limit,
    });
  }

  /**
   * Các thực phẩm (theo id) mà gia đình được dùng — kiểm tra food_id client gửi lên
   * khi nhập kho/danh sách/công thức (B7). @br BR-04, BR-06
   */
  findUsable(familyId: string | null, ids: readonly string[]): Promise<Food[]> {
    return this.foods.findVisibleByIds(ids, familyId);
  }

  /** Các thực phẩm khớp đúng tên chuẩn hoá mà gia đình được dùng (tự gắn food_id). @br BR-04 */
  findUsableByNames(familyId: string | null, names: readonly string[]): Promise<Food[]> {
    return this.foods.findVisibleByNames(names, familyId);
  }

  /**
   * Gia đình đề xuất tên mới. Tên đã có: APPROVED hoặc PENDING của chính gia đình → trả lại
   * bản có sẵn; PENDING của gia đình khác → 409 FOOD_PENDING_REVIEW; REJECTED → 409
   * FOOD_REJECTED (app vẫn lưu được với food_id = NULL và tên tự do — §11).
   * @uc UC-FRIDGE-01  @fr FR-09, FR-26  @br BR-04, BR-08
   */
  async contribute(
    viewer: Viewer & { familyId: string },
    dto: ContributeFoodDto,
  ): Promise<ContributeResult> {
    const existing = await this.foods.findByName(dto.name);
    if (existing) {
      return { food: this.reuseExisting(existing, viewer.familyId), created: false };
    }
    await this.assertCategory(dto.categoryId);

    try {
      const food = await this.foods.save(
        this.foods.create({
          name: dto.name,
          categoryId: dto.categoryId,
          approvalStatus: ApprovalStatus.Pending,
          createdByFamilyId: viewer.familyId,
        }),
      );
      this.events.emit(
        FOOD_SUBMITTED,
        new FoodSubmittedEvent(food.id, food.name, viewer.familyId, viewer.userId),
      );
      return { food, created: true };
    } catch (error: unknown) {
      if (uniqueViolationConstraint(error) !== 'uq_foods_name') {
        throw error;
      }
      // Another request created the same name meanwhile: apply the same rules to it.
      const raced = await this.foods.findByName(dto.name);
      if (!raced) {
        throw error;
      }
      return { food: this.reuseExisting(raced, viewer.familyId), created: false };
    }
  }

  /** Danh sách thực phẩm cho Admin (mọi trạng thái). @uc UC-ADM-02, UC-ADM-03  @fr FR-25, FR-26 */
  listForAdmin(query: AdminFoodsQueryDto): Promise<[Food[], number]> {
    return this.foods.findForAdmin({
      key: query.q ? toSearchKey(query.q) : undefined,
      status: query.status,
      categoryId: query.categoryId,
      offset: query.offset,
      limit: query.pageSize,
    });
  }

  async getById(id: string): Promise<Food> {
    const food = await this.foods.findOne({ where: { id }, relations: { category: true } });
    if (!food) {
      throw AppException.notFound('Không tìm thấy thực phẩm.');
    }
    return food;
  }

  /** Admin tạo thực phẩm chuẩn (APPROVED ngay, không thuộc gia đình nào). @uc UC-ADM-02  @fr FR-25 */
  async create(dto: CreateFoodDto): Promise<Food> {
    await this.assertCategory(dto.categoryId);
    const food = this.foods.create({
      name: dto.name,
      categoryId: dto.categoryId,
      approvalStatus: ApprovalStatus.Approved,
      createdByFamilyId: null,
    });
    return this.saveUnique(food);
  }

  /** Admin sửa tên (đã chuẩn hoá) hoặc danh mục. @uc UC-ADM-02  @fr FR-25  @br BR-04 */
  async update(id: string, dto: UpdateFoodDto): Promise<Food> {
    const food = await this.getById(id);
    if (dto.name !== undefined) {
      food.name = dto.name;
    }
    if (dto.categoryId !== undefined && dto.categoryId !== food.categoryId) {
      await this.assertCategory(dto.categoryId);
      food.categoryId = dto.categoryId;
      food.category = undefined;
    }
    await this.saveUnique(food);
    return this.getById(id);
  }

  /**
   * Admin xoá thực phẩm — bị chặn nếu đang dùng trong kho, danh sách mua hoặc công thức
   * (giữ gộp báo cáo theo food_id; quyết định B5).
   * @uc UC-ADM-02  @fr FR-25
   */
  async remove(id: string): Promise<void> {
    await this.getById(id);
    const usage = await this.foods.countUsages(id);
    if (totalUsage(usage) > 0) {
      throw new AppException(ErrorCode.FoodInUse, undefined, HttpStatus.CONFLICT, usage);
    }
    await this.foods.delete({ id });
  }

  /** Admin duyệt tên thực phẩm mới → công khai cho mọi gia đình. @uc UC-ADM-03  @fr FR-26  @br BR-08 */
  async approve(adminId: string, id: string): Promise<Food> {
    const food = await this.getById(id);
    food.approve();
    await this.foods.save(food);
    this.events.emit(
      FOOD_APPROVED,
      new FoodReviewedEvent(food.id, food.name, food.createdByFamilyId, adminId),
    );
    return food;
  }

  /** Admin từ chối tên thực phẩm mới (kèm lý do). @uc UC-ADM-03  @fr FR-26  @br BR-08 */
  async reject(adminId: string, id: string, reason?: string): Promise<Food> {
    const food = await this.getById(id);
    food.reject();
    await this.foods.save(food);
    this.events.emit(
      FOOD_REJECTED,
      new FoodReviewedEvent(food.id, food.name, food.createdByFamilyId, adminId, reason ?? null),
    );
    return food;
  }

  /** Số tên đang chờ duyệt (cho bảng điều khiển Admin). @uc UC-ADM-03 */
  countPending(): Promise<number> {
    return this.foods.countByStatus([ApprovalStatus.Pending]);
  }

  private reuseExisting(food: Food, familyId: string): Food {
    if (food.isVisibleTo(familyId)) {
      return food;
    }
    if (food.approvalStatus === ApprovalStatus.Rejected) {
      throw new AppException(ErrorCode.FoodRejected, undefined, HttpStatus.CONFLICT, {
        name: food.name,
      });
    }
    throw new AppException(ErrorCode.FoodPendingReview, undefined, HttpStatus.CONFLICT, {
      name: food.name,
    });
  }

  private async assertCategory(categoryId: string): Promise<void> {
    if (!(await this.categoriesService.exists(categoryId))) {
      throw AppException.validation(
        [{ field: 'categoryId', constraints: { exists: 'Danh mục không tồn tại.' } }],
        'Danh mục không tồn tại.',
      );
    }
  }

  private async saveUnique(food: Food): Promise<Food> {
    try {
      return await this.foods.save(food);
    } catch (error: unknown) {
      if (uniqueViolationConstraint(error) === 'uq_foods_name') {
        throw new AppException(ErrorCode.FoodNameTaken, undefined, HttpStatus.CONFLICT, {
          name: food.name,
        });
      }
      throw error;
    }
  }
}
