import {
    Injectable,
    BadRequestException,
    NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, In, DeepPartial } from "typeorm";
import { BlogPost, PublishingStatus } from "./entities/blog-post.entity";
import { BlogPostSeo } from "./entities/blog-post-seo.entity";
import { User } from "../users/entities/user.entity";
import { BlogCategory } from "../blog-categories/entities/blog-category.entity";
import { Tag } from "../tags/entities/tag.entity";
import { CreateBlogPostDto } from "./dto/create-blog-post.dto";
import { UpdateBlogPostDto } from "./dto/update-blog-post.dto";
import { ListBlogPostsQueryDto } from "./dto/list-blog-posts.query.dto";
import { ListPublicBlogsQueryDto } from "./dto/list-public-blogs.query.dto";
import { ListTrendingBlogsQueryDto } from "./dto/list-trending-blogs.query.dto";

@Injectable()
export class BlogService {
    constructor(
        @InjectRepository(BlogPost)
        private readonly postRepo: Repository<BlogPost>,
        @InjectRepository(BlogPostSeo)
        private readonly seoRepo: Repository<BlogPostSeo>,
        @InjectRepository(User)
        private readonly userRepo: Repository<User>,
        @InjectRepository(BlogCategory)
        private readonly categoryRepo: Repository<BlogCategory>,
        @InjectRepository(Tag)
        private readonly tagRepo: Repository<Tag>,
    ) { }

    // ────────────────── CREATE ──────────────────

    // ────────────────── SANITIZE ──────────────────

    private sanitizeAuthor(author: User) {
        return {
            id: author.id,
            fullLegalName: author.fullLegalName,
            medicalEmail: author.medicalEmail,
            professionalRole: author.professionalRole,
        };
    }

    private sanitize(post: BlogPost) {
        return {
            ...post,
            authors: post.authors?.map((a) => this.sanitizeAuthor(a)) ?? [],
        };
    }

    // ────────────────── CREATE ──────────────────

    async create(dto: CreateBlogPostDto) {
        // Validate scheduled status requires a date
        if (
            dto.publishingStatus === PublishingStatus.SCHEDULED &&
            !dto.scheduledPublishDate
        ) {
            throw new BadRequestException(
                "scheduledPublishDate is required when publishingStatus is 'scheduled'",
            );
        }

        // Resolve authors
        let authors: User[] = [];
        if (dto.authorIds?.length) {
            authors = await this.userRepo.findBy({ id: In(dto.authorIds) });
            if (authors.length !== dto.authorIds.length) {
                throw new BadRequestException("One or more authorIds are invalid");
            }
        }

        // Resolve categories
        let categories: BlogCategory[] = [];
        if (dto.categoryIds?.length) {
            categories = await this.categoryRepo.findBy({
                id: In(dto.categoryIds),
            });
            if (categories.length !== dto.categoryIds.length) {
                throw new BadRequestException("One or more categoryIds are invalid");
            }
        }

        // Resolve tags
        let tags: Tag[] = [];
        if (dto.tagIds?.length) {
            tags = await this.tagRepo.findBy({ id: In(dto.tagIds) });
            if (tags.length !== dto.tagIds.length) {
                throw new BadRequestException("One or more tagIds are invalid");
            }
        }

        const publishedAt =
            dto.publishingStatus === PublishingStatus.PUBLISHED
                ? new Date()
                : undefined;

        const post = this.postRepo.create({
            title: dto.title,
            content: dto.content,
            coverImageUrl: dto.coverImageUrl,
            publishingStatus: dto.publishingStatus ?? PublishingStatus.DRAFT,
            scheduledPublishDate: dto.scheduledPublishDate
                ? new Date(dto.scheduledPublishDate)
                : undefined,
            isFeatured: dto.isFeatured ?? false,
            excerpt: dto.excerpt,
            readTimeMinutes: dto.readTimeMinutes ?? 5,
            publishedAt,
            authors,
            categories,
            tags,
            seo: {
                metaTitle: dto.seoMetaTitle,
                metaDescription: dto.seoMetaDescription,
            },
        } as DeepPartial<BlogPost>);

        return this.sanitize(await this.postRepo.save(post));
    }

    // ────────────────── UPDATE ──────────────────

    async update(id: string, dto: UpdateBlogPostDto) {
        const post = await this.postRepo.findOne({
            where: { id },
            relations: ["authors", "categories", "tags", "seo"],
        });
        if (!post) {
            throw new NotFoundException("Blog post not found");
        }

        // Validate scheduled status
        const newStatus = dto.publishingStatus ?? post.publishingStatus;
        const newScheduledDate =
            dto.scheduledPublishDate !== undefined
                ? dto.scheduledPublishDate
                : post.scheduledPublishDate?.toISOString();

        if (newStatus === PublishingStatus.SCHEDULED && !newScheduledDate) {
            throw new BadRequestException(
                "scheduledPublishDate is required when publishingStatus is 'scheduled'",
            );
        }

        // Scalar fields
        if (dto.title !== undefined) post.title = dto.title;
        if (dto.content !== undefined) post.content = dto.content;
        if (dto.coverImageUrl !== undefined) post.coverImageUrl = dto.coverImageUrl;
        if (dto.publishingStatus !== undefined)
            post.publishingStatus = dto.publishingStatus;
        if (dto.scheduledPublishDate !== undefined)
            post.scheduledPublishDate = new Date(dto.scheduledPublishDate);
        if (dto.isFeatured !== undefined) post.isFeatured = dto.isFeatured;
        if (dto.excerpt !== undefined) post.excerpt = dto.excerpt;

        // Set publishedAt when transitioning to published
        if (
            dto.publishingStatus === PublishingStatus.PUBLISHED &&
            !post.publishedAt
        ) {
            post.publishedAt = new Date();
        }

        // Relations
        if (dto.authorIds !== undefined) {
            post.authors = dto.authorIds.length
                ? await this.userRepo.findBy({ id: In(dto.authorIds) })
                : [];
        }
        if (dto.categoryIds !== undefined) {
            post.categories = dto.categoryIds.length
                ? await this.categoryRepo.findBy({ id: In(dto.categoryIds) })
                : [];
        }
        if (dto.tagIds !== undefined) {
            post.tags = dto.tagIds.length
                ? await this.tagRepo.findBy({ id: In(dto.tagIds) })
                : [];
        }

        // SEO
        if (dto.seoMetaTitle !== undefined || dto.seoMetaDescription !== undefined) {
            if (!post.seo) {
                post.seo = this.seoRepo.create({ postId: post.id });
            }
            if (dto.seoMetaTitle !== undefined)
                post.seo.metaTitle = dto.seoMetaTitle;
            if (dto.seoMetaDescription !== undefined)
                post.seo.metaDescription = dto.seoMetaDescription;
        }

        return this.sanitize(await this.postRepo.save(post));
    }

    // ────────────────── GET ONE ──────────────────

    async findOne(id: string) {
        const post = await this.postRepo.findOne({
            where: { id },
            relations: ["authors", "categories", "tags", "seo"],
        });
        if (!post) {
            throw new NotFoundException("Blog post not found");
        }
        return this.sanitize(post);
    }

    // ────────────────── LIST ──────────────────

    async findAll(query: ListBlogPostsQueryDto) {
        const page = query.page ?? 1;
        const limit = query.limit ?? 10;
        const skip = (page - 1) * limit;

        const qb = this.postRepo
            .createQueryBuilder("post")
            .leftJoinAndSelect("post.authors", "author")
            .leftJoinAndSelect("post.categories", "category")
            .leftJoinAndSelect("post.tags", "tag")
            .leftJoinAndSelect("post.seo", "seo");

        // ── Filters ──

        if (query.status) {
            qb.andWhere("post.publishingStatus = :status", {
                status: query.status,
            });
        }

        if (query.categoryId) {
            qb.andWhere("category.id = :categoryId", {
                categoryId: query.categoryId,
            });
        }

        if (query.tagId) {
            qb.andWhere("tag.id = :tagId", { tagId: query.tagId });
        }

        if (query.search?.trim()) {
            const s = `%${query.search.trim().toLowerCase()}%`;
            qb.andWhere("(LOWER(post.title) LIKE :s OR LOWER(post.excerpt) LIKE :s)", {
                s,
            });
        }

        // ── Status tab counts ──
        const countsRaw = await this.postRepo
            .createQueryBuilder("p")
            .select([
                "COUNT(*) AS all",
                `COUNT(*) FILTER (WHERE p."publishingStatus" = 'draft') AS draft`,
                `COUNT(*) FILTER (WHERE p."publishingStatus" = 'scheduled') AS scheduled`,
                `COUNT(*) FILTER (WHERE p."publishingStatus" = 'published') AS published`,
            ])
            .getRawOne();

        qb.orderBy("post.createdAt", "DESC");
        qb.skip(skip).take(limit);

        const [items, total] = await qb.getManyAndCount();

        return {
            items: items.map((p) => this.sanitize(p)),
            meta: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
            statusCounts: {
                all: Number(countsRaw?.all ?? 0),
                draft: Number(countsRaw?.draft ?? 0),
                scheduled: Number(countsRaw?.scheduled ?? 0),
                published: Number(countsRaw?.published ?? 0),
            },
        };
    }

    // ────────────────── DELETE ──────────────────

    async remove(id: string) {
        const post = await this.postRepo.findOne({ where: { id } });
        if (!post) {
            throw new NotFoundException("Blog post not found");
        }
        await this.postRepo.remove(post);
        return { deleted: true };
    }

    // ────────────────── PUBLIC ENDPOINTS ──────────────────

    private sanitizePublicAuthor(author: User) {
        return {
            id: author.id,
            fullLegalName: author.fullLegalName,
            professionalRole: author.professionalRole,
            profilePhotoUrl: author.profilePhotoUrl,
        };
    }

    private formatReadCount(readCount: number): string {
        const count = Number.isFinite(readCount) ? Math.max(0, readCount) : 0;

        if (count < 1000) {
            return `${count}`;
        }

        if (count < 1000000) {
            const k = count / 1000;
            const rounded = k >= 10 ? k.toFixed(0) : k.toFixed(1);
            return `${rounded.replace(/\.0$/, "")}k`;
        }

        const m = count / 1000000;
        const rounded = m >= 10 ? m.toFixed(0) : m.toFixed(1);
        return `${rounded.replace(/\.0$/, "")}m`;
    }

    private toPublicBlogCard(post: BlogPost) {
        return {
            id: post.id,
            title: post.title,
            description: post.excerpt || post.content?.substring(0, 200),
            coverImageUrl: post.coverImageUrl,
            categories: post.categories.map((cat) => ({
                id: cat.id,
                name: cat.name,
            })),
            authors: post.authors.map((author) => this.sanitizePublicAuthor(author)),
            readTimeMinutes: post.readTimeMinutes,
            readCount: post.readCount ?? 0,
            readBy: this.formatReadCount(post.readCount ?? 0),
            publishedAt: post.publishedAt,
            isFeatured: post.isFeatured,
        };
    }

    async findAllPublic(query: ListPublicBlogsQueryDto) {
        const page = query.page ?? 1;
        const limit = query.limit ?? 10;
        const skip = (page - 1) * limit;

        const qb = this.postRepo
            .createQueryBuilder("post")
            .leftJoinAndSelect("post.authors", "authors")
            .leftJoinAndSelect("post.categories", "categories")
            .leftJoinAndSelect("post.tags", "tags")
            .where("post.publishingStatus = :status", { status: PublishingStatus.PUBLISHED });

        // Search filter
        if (query.search?.trim()) {
            const s = `%${query.search.trim().toLowerCase()}%`;
            qb.andWhere(
                "(LOWER(post.title) LIKE :s OR LOWER(post.excerpt) LIKE :s OR LOWER(post.content) LIKE :s)",
                { s }
            );
        }

        // Category filter
        if (query.categoryId?.trim()) {
            qb.andWhere("categories.id = :categoryId", { categoryId: query.categoryId });
        }

        // Sorting
        switch (query.sortBy) {
            case 'oldest':
                qb.orderBy("post.publishedAt", "ASC");
                break;
            case 'featured':
                qb.orderBy("post.isFeatured", "DESC").addOrderBy("post.publishedAt", "DESC");
                break;
            case 'latest':
            default:
                qb.orderBy("post.publishedAt", "DESC");
                break;
        }

        const [posts, total] = await qb.skip(skip).take(limit).getManyAndCount();

        const items = posts.map((post) => this.toPublicBlogCard(post));

        return {
            items,
            meta: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    async findOnePublic(id: string) {
        const post = await this.postRepo.findOne({
            where: { 
                id, 
                publishingStatus: PublishingStatus.PUBLISHED 
            },
            relations: ["authors", "categories", "tags", "seo"],
        });

        if (!post) {
            throw new NotFoundException("Blog post not found or not published");
        }

        await this.postRepo.increment({ id: post.id }, "readCount", 1);

        const updatedReadCount = (post.readCount ?? 0) + 1;

        return {
            id: post.id,
            title: post.title,
            content: post.content,
            description: post.excerpt,
            coverImageUrl: post.coverImageUrl,
            categories: post.categories.map((cat) => ({
                id: cat.id,
                name: cat.name,
            })),
            tags: post.tags.map((tag) => ({
                id: tag.id,
                name: tag.name,
            })),
            authors: post.authors.map((author) => this.sanitizePublicAuthor(author)),
            readTimeMinutes: post.readTimeMinutes,
            readCount: updatedReadCount,
            readBy: this.formatReadCount(updatedReadCount),
            publishedAt: post.publishedAt,
            isFeatured: post.isFeatured,
            seo: {
                metaTitle: post.seo?.metaTitle,
                metaDescription: post.seo?.metaDescription,
            },
        };
    }

    async findTrendingPublic(query: ListTrendingBlogsQueryDto) {
        const limit = query.limit ?? 6;

        const posts = await this.postRepo
            .createQueryBuilder("post")
            .leftJoinAndSelect("post.authors", "authors")
            .leftJoinAndSelect("post.categories", "categories")
            .where("post.publishingStatus = :status", {
                status: PublishingStatus.PUBLISHED,
            })
            .orderBy("post.readCount", "DESC")
            .addOrderBy("post.publishedAt", "DESC")
            .take(limit)
            .getMany();

        return {
            items: posts.map((post) => this.toPublicBlogCard(post)),
            meta: {
                limit,
                total: posts.length,
            },
        };
    }
}
