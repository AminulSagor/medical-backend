import {
    Injectable,
    BadRequestException,
    NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { QueryFailedError } from "typeorm";
import { BlogCategory } from "./entities/blog-category.entity";
import { CreateBlogCategoryDto } from "./dto/create-blog-category.dto";
import { UpdateBlogCategoryDto } from "./dto/update-blog-category.dto";
import { BulkCreateBlogCategoryDto } from "./dto/bulk-create-blog-category.dto";

@Injectable()
export class BlogCategoriesService {
    constructor(
        @InjectRepository(BlogCategory)
        private readonly repo: Repository<BlogCategory>,
    ) { }

    async create(dto: CreateBlogCategoryDto) {
        const slug = dto.name
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");

        try {
            const category = this.repo.create({
                name: dto.name.trim(),
                slug,
                description: dto.description,
                isActive: dto.isActive ?? true,
            });
            return await this.repo.save(category);
        } catch (error) {
            if (
                error instanceof QueryFailedError &&
                (error as any).driverError?.code === "23505"
            ) {
                throw new BadRequestException("Blog category already exists");
            }
            throw error;
        }
    }

    async list() {
        return this.repo.find({ order: { name: "ASC" } });
    }

    async bulkCreate(dto: BulkCreateBlogCategoryDto) {
        const items = dto.categories.map((c) => {
            const name = c.name.trim();
            const slug = name
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-|-$/g, "");
            return {
                name,
                slug,
                description: c.description,
                isActive: c.isActive ?? true,
            };
        });

        // Check for existing categories first
        const existingNames = await this.repo
            .createQueryBuilder()
            .select("name")
            .where("name IN (:...names)", { names: items.map(i => i.name) })
            .getRawMany();
        
        const existingNamesSet = new Set(existingNames.map(e => e.name));
        
        // Filter out existing categories
        const newItems = items.filter(item => !existingNamesSet.has(item.name));
        
        if (newItems.length === 0) {
            // All categories already exist, return existing ones
            const names = items.map((i) => i.name);
            return this.repo.find({
                where: names.map((name) => ({ name })),
                order: { name: "ASC" },
            });
        }

        // Insert only new categories
        await this.repo
            .createQueryBuilder()
            .insert()
            .into(BlogCategory)
            .values(newItems)
            .execute();

        // Return all categories (existing + new)
        const names = items.map((i) => i.name);
        return this.repo.find({
            where: names.map((name) => ({ name })),
            order: { name: "ASC" },
        });
    }

    async findOne(id: string) {
        const cat = await this.repo.findOne({ where: { id } });
        if (!cat) throw new NotFoundException("Blog category not found");
        return cat;
    }

    async update(id: string, dto: UpdateBlogCategoryDto) {
        const cat = await this.findOne(id);

        if (dto.name !== undefined) {
            cat.name = dto.name.trim();
            cat.slug = dto.name
                .toLowerCase()
                .trim()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-|-$/g, "");
        }
        if (dto.description !== undefined) cat.description = dto.description;
        if (dto.isActive !== undefined) cat.isActive = dto.isActive;

        try {
            return await this.repo.save(cat);
        } catch (error) {
            if (
                error instanceof QueryFailedError &&
                (error as any).driverError?.code === "23505"
            ) {
                throw new BadRequestException("Blog category name already exists");
            }
            throw error;
        }
    }

    async remove(id: string) {
        const cat = await this.findOne(id);
        await this.repo.remove(cat);
        return { deleted: true };
    }
}
