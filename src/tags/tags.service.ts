import { Injectable, BadRequestException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { ILike, Repository } from "typeorm";
import { Tag } from "./entities/tag.entity";
import { CreateTagDto } from "./dto/create-tag.dto";
import { BulkCreateTagDto } from "./dto/bulk-create-tag.dto";
import { QueryFailedError } from "typeorm";

@Injectable()
export class TagsService {
    constructor(
        @InjectRepository(Tag) private readonly tagRepo: Repository<Tag>,
    ) { }

    async create(dto: CreateTagDto) {
        const slug = dto.name
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");

        try {
            const tag = this.tagRepo.create({ name: dto.name.trim(), slug });
            return await this.tagRepo.save(tag);
        } catch (error) {
            if (
                error instanceof QueryFailedError &&
                (error as any).driverError?.code === "23505"
            ) {
                throw new BadRequestException("Tag already exists");
            }
            throw error;
        }
    }

    async bulkCreate(dto: BulkCreateTagDto) {
        const items = dto.tags.map((t) => {
            const name = t.name.trim();
            const slug = name
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-|-$/g, "");
            return { name, slug };
        });

        const result = await this.tagRepo
            .createQueryBuilder()
            .insert()
            .into(Tag)
            .values(items)
            .orIgnore()
            .execute();

        const names = items.map((i) => i.name);
        return this.tagRepo.find({
            where: names.map((name) => ({ name })),
            order: { name: "ASC" },
        });
    }

    async list(q?: string) {
        if (q && q.trim()) {
            return this.tagRepo.find({
                where: { name: ILike(`%${q.trim()}%`) },
                order: { name: "ASC" },
            });
        }
        return this.tagRepo.find({ order: { name: "ASC" } });
    }
}
