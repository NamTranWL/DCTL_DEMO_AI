import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** `?page=&pageSize=` query parameters; responses use `Paged` → `{ data, meta }`. */
export class PaginationQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Số trang phải là số nguyên.' })
  @Min(1, { message: 'Số trang phải từ 1 trở lên.' })
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Kích thước trang phải là số nguyên.' })
  @Min(1, { message: 'Kích thước trang phải từ 1 trở lên.' })
  @Max(MAX_PAGE_SIZE, { message: `Kích thước trang tối đa ${MAX_PAGE_SIZE}.` })
  pageSize: number = DEFAULT_PAGE_SIZE;

  get offset(): number {
    return (this.page - 1) * this.pageSize;
  }
}
