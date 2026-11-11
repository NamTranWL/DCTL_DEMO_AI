import { type AllergyEntry } from '@dctl/shared';
import { Injectable } from '@nestjs/common';
import { type DietaryProfile } from './entities/dietary-profile.entity';
import { type UpsertDietaryProfileDto } from './dto/dietary-profile.dto';
import { DietaryProfileRepository } from './repositories/dietary-profile.repository';

/**
 * Hồ sơ ăn uống của người dùng: khẩu vị, dị ứng, mục tiêu dinh dưỡng — ràng buộc cho AI.
 * Mỗi người chỉ đọc/sửa hồ sơ của chính mình (userId lấy từ phiên đăng nhập).
 * @uc UC-FAM-02  @fr FR-02  @br BR-07
 */
@Injectable()
export class DietaryProfileService {
  constructor(private readonly profiles: DietaryProfileRepository) {}

  /** Xem hồ sơ ăn uống; null khi chưa thiết lập. @uc UC-FAM-02  @fr FR-02 */
  get(userId: string): Promise<DietaryProfile | null> {
    return this.profiles.findByUserId(userId);
  }

  /**
   * Tạo mới hoặc thay toàn bộ hồ sơ ăn uống. Dị ứng trùng (cùng foodId hoặc cùng tên,
   * không phân biệt hoa thường) được gộp; khẩu vị trùng bị bỏ.
   * @uc UC-FAM-02  @fr FR-02  @br BR-07
   */
  async upsert(userId: string, dto: UpsertDietaryProfileDto): Promise<DietaryProfile> {
    const existing = await this.profiles.findByUserId(userId);
    const profile = existing ?? this.profiles.create({ userId });
    profile.allergies = dedupeAllergies(dto.allergies);
    profile.tastePreferences = [...new Set(dto.tastePreferences)];
    profile.nutritionGoal = dto.nutritionGoal ? dto.nutritionGoal : null;
    return this.profiles.save(profile);
  }

  /** Xoá hồ sơ (trở về mặc định: không dị ứng, không ràng buộc). @uc UC-FAM-02  @fr FR-02 */
  async reset(userId: string): Promise<void> {
    await this.profiles.delete({ userId });
  }

  /**
   * Hồ sơ ăn uống của cả gia đình — ràng buộc tổng hợp khi gợi ý món (UC-AI-01 bước 2).
   * @uc UC-AI-01  @fr FR-18  @br BR-06, BR-07
   */
  getFamilyProfiles(familyId: string): Promise<DietaryProfile[]> {
    return this.profiles.findByFamilyId(familyId);
  }
}

/** Remove duplicate allergies (same foodId, or same name ignoring case). */
export function dedupeAllergies(entries: readonly AllergyEntry[]): AllergyEntry[] {
  const seen = new Set<string>();
  const result: AllergyEntry[] = [];
  for (const entry of entries) {
    const keys = [`name:${entry.name.toLocaleLowerCase('vi')}`];
    if (entry.foodId) {
      keys.push(`food:${entry.foodId}`);
    }
    if (keys.some((key) => seen.has(key))) {
      continue;
    }
    keys.forEach((key) => seen.add(key));
    result.push(entry.foodId ? { foodId: entry.foodId, name: entry.name } : { name: entry.name });
  }
  return result;
}
