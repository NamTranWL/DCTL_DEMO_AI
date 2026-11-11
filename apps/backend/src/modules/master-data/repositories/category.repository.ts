import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BaseRepository } from '../../../database/base.repository';
import { Category } from '../entities/category.entity';

/** Truy xuất danh mục thực phẩm (Repository pattern, §10). */
@Injectable()
export class CategoryRepository extends BaseRepository<Category> {
  constructor(dataSource: DataSource) {
    super(Category, dataSource);
  }

  findAllOrdered(): Promise<Category[]> {
    return this.find({ order: { name: 'ASC' } });
  }
}
