import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, In, Repository } from 'typeorm';
import { Category } from './entities/category.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { BulkCreateCategoryDto } from './dto/bulk-create-category.dto';

@Injectable()
export class CategoriesService {
  constructor(@InjectRepository(Category) private repo: Repository<Category>) {}

  async list(q?: string) {
    if (q && q.trim()) {
      return this.repo.find({
        where: { name: ILike(`%${q.trim()}%`) },
        order: { name: 'ASC' },
      });
    }
    return this.repo.find({ order: { name: 'ASC' } });
  }

  async create(dto: CreateCategoryDto) {
    const name = dto.name.trim();

    const exists = await this.repo.findOne({
      where: { name },
    });

    if (exists) throw new BadRequestException('Category already exists');

    const category = this.repo.create({ name });
    return this.repo.save(category);
  }

  async bulkCreate(dto: BulkCreateCategoryDto) {
    const names = dto.categories.map((c) => c.name.trim());

    // Find already existing categories
    const existing = await this.repo.find({
      where: names.map((name) => ({ name })),
    });
    const existingNames = new Set(existing.map((e) => e.name));

    // Only insert truly new ones
    const newNames = names.filter((name) => !existingNames.has(name));
    if (newNames.length > 0) {
      const newEntities = newNames.map((name) => this.repo.create({ name }));
      await this.repo.save(newEntities);
    }

    // Return all requested categories (existing + newly created)
    return this.repo.find({
      where: { name: In(names) },
      order: { name: 'ASC' },
    });
  }
}
