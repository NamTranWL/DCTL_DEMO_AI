import { HttpStatus, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCode } from '../../common/exceptions/error-code.enum';
import { isForeignKeyViolation, uniqueViolationConstraint } from '../../common/utils/db-error.util';
import { type CreateCategoryDto, type UpdateCategoryDto } from './dto/category-unit.dto';
import { type Category } from './entities/category.entity';
import { CategoryRepository } from './repositories/category.repository';

/**
 * Quản lý danh mục thực phẩm (master data): rau củ, thịt cá, đồ khô… kèm gợi ý bảo quản
 * và hạn dùng mặc định.
 * @uc UC-ADM-02  @fr FR-05, FR-11, FR-25  @br BR-02, BR-04
 */
@Injectable()
export class CategoriesService {
  constructor(private readonly categories: CategoryRepository) {}

  /** Danh sách danh mục (mọi người dùng — chọn khi nhập kho/danh sách). @fr FR-05, FR-11 */
  list(): Promise<Category[]> {
    return this.categories.findAllOrdered();
  }

  /** Lấy danh mục theo id, 404 nếu không có. */
  async getById(id: string): Promise<Category> {
    const category = await this.categories.findOneBy({ id });
    if (!category) {
      throw AppException.notFound('Không tìm thấy danh mục.');
    }
    return category;
  }

  /** Các danh mục theo id (thiếu id nào → bỏ qua; người gọi tự kiểm tra). @br BR-02, BR-04 */
  findMany(ids: readonly string[]): Promise<Category[]> {
    return ids.length === 0
      ? Promise.resolve([])
      : this.categories.findBy({ id: In([...new Set(ids)]) });
  }

  /** Danh mục có tồn tại không. */
  exists(id: string): Promise<boolean> {
    return this.categories.existsBy({ id });
  }

  /** Admin tạo danh mục. @uc UC-ADM-02  @fr FR-25 */
  async create(dto: CreateCategoryDto): Promise<Category> {
    const category = this.categories.create({
      name: dto.name,
      storageAdvice: dto.storageAdvice ?? null,
      defaultShelfLifeDays: dto.defaultShelfLifeDays,
    });
    return this.saveUnique(category);
  }

  /** Admin sửa danh mục. @uc UC-ADM-02  @fr FR-25 */
  async update(id: string, dto: UpdateCategoryDto): Promise<Category> {
    const category = await this.getById(id);
    if (dto.name !== undefined) {
      category.name = dto.name;
    }
    if (dto.storageAdvice !== undefined) {
      category.storageAdvice = dto.storageAdvice;
    }
    if (dto.defaultShelfLifeDays !== undefined) {
      category.defaultShelfLifeDays = dto.defaultShelfLifeDays;
    }
    return this.saveUnique(category);
  }

  /** Admin xoá danh mục; đang được dùng (thực phẩm, kho, danh sách) → 409. @uc UC-ADM-02  @fr FR-25 */
  async remove(id: string): Promise<void> {
    await this.getById(id);
    try {
      await this.categories.delete({ id });
    } catch (error: unknown) {
      if (isForeignKeyViolation(error)) {
        throw new AppException(
          ErrorCode.MasterDataInUse,
          'Danh mục đang được dùng cho thực phẩm, kho hoặc danh sách mua nên không thể xoá.',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  private async saveUnique(category: Category): Promise<Category> {
    try {
      return await this.categories.save(category);
    } catch (error: unknown) {
      if (uniqueViolationConstraint(error) === 'uq_categories_name') {
        throw new AppException(ErrorCode.CategoryNameTaken, undefined, HttpStatus.CONFLICT);
      }
      throw error;
    }
  }
}
