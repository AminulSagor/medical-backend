import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Category } from "./entities/category.entity";
import { CreateCategoryDto } from "./dto/create-category.dto";
import { BulkCreateCategoryDto } from "./dto/bulk-create-category.dto";

@Injectable()
export class CategoriesService {
    constructor(@InjectRepository(Category) private repo: Repository<Category>) { }

    async list() {
        return this.repo.find({ order: { name: "ASC" } });
    }

    async create(dto: CreateCategoryDto) {
        const name = dto.name.trim();

        const exists = await this.repo.findOne({
            where: { name },
        });

        if (exists) throw new BadRequestException("Category already exists");

        const category = this.repo.create({ name });
        return this.repo.save(category);
    }

    async bulkCreate(dto: BulkCreateCategoryDto) {
        const items = dto.categories.map((c) => ({ name: c.name.trim() }));

        await this.repo
            .createQueryBuilder()
            .insert()
            .into(Category)
            .values(items)
            .orIgnore()
            .execute();

        const names = items.map((i) => i.name);
        return this.repo.find({
            where: names.map((name) => ({ name })),
            order: { name: "ASC" },
        });
    }
}
