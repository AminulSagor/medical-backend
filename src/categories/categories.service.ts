import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, In, Repository } from 'typeorm';
import { BlogCategory } from '../blog-categories/entities/blog-category.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { BulkCreateCategoryDto } from './dto/bulk-create-category.dto';

@Injectable()
export class CategoriesService {
  constructor(@InjectRepository(BlogCategory) private repo: Repository<BlogCategory>) {}

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
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const exists = await this.repo.findOne({
      where: { name },
    });

    if (exists) throw new BadRequestException('Category already exists');

    const category = this.repo.create({ name, slug, isActive: true });
    return this.repo.save(category);
  }

  async bulkCreate(dto: BulkCreateCategoryDto) {
    const items = dto.categories.map((c) => {
      const name = c.name.trim();
      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      return { name, slug, isActive: true };
    });

    // Find already existing categories
    const names = items.map((i) => i.name);
    const existing = await this.repo.find({
      where: names.map((name) => ({ name })),
    });
    const existingNames = new Set(existing.map((e) => e.name));

    // Only insert truly new ones
    const newItems = items.filter((item) => !existingNames.has(item.name));
    if (newItems.length > 0) {
      const newEntities = newItems.map((item) => this.repo.create(item));
      await this.repo.save(newEntities);
    }

    // Return all requested categories (existing + newly created)
    return this.repo.find({
      where: { name: In(names) },
      order: { name: 'ASC' },
    });
  }
}
