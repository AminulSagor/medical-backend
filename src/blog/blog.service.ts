import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, DeepPartial } from 'typeorm';
import { BlogPost, PublishingStatus } from './entities/blog-post.entity';
import { BlogPostSeo } from './entities/blog-post-seo.entity';
import { User } from '../users/entities/user.entity';
import { BlogCategory } from '../blog-categories/entities/blog-category.entity';
import { Tag } from '../tags/entities/tag.entity';
import { CreateBlogPostDto } from './dto/create-blog-post.dto';
import { UpdateBlogPostDto } from './dto/update-blog-post.dto';
import { ListBlogPostsQueryDto } from './dto/list-blog-posts.query.dto';
import { ListPublicBlogsQueryDto } from './dto/list-public-blogs.query.dto';
import { ListTrendingBlogsQueryDto } from './dto/list-trending-blogs.query.dto';
import { SchedulePostDto } from './dto/calendar.dto';
import { NewsletterBroadcastArticleLink } from 'src/newsletters/broadcasts/entities/newsletter-broadcast-article-link.entity';

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
    @InjectRepository(NewsletterBroadcastArticleLink)
    private readonly articleLinkRepo: Repository<NewsletterBroadcastArticleLink>,
  ) {}

  // ────────────────── ANALYTICS ──────────────────

  async getAnalyticsOverview(): Promise<Record<string, unknown>> {
    const now = new Date();

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(now.getDate() - 7);

    const stats = await this.postRepo
      .createQueryBuilder('post')
      .select('COUNT(post.id)', 'totalPosts')
      .addSelect(
        `SUM(CASE WHEN post.publishingStatus = 'published' THEN 1 ELSE 0 END)`,
        'published',
      )
      .addSelect(
        `SUM(CASE WHEN post.publishingStatus = 'draft' THEN 1 ELSE 0 END)`,
        'drafts',
      )
      .addSelect(
        `SUM(CASE WHEN post.publishingStatus = 'published' AND post.publishedAt >= :oneWeekAgo THEN 1 ELSE 0 END)`,
        'publishedThisWeek',
      )
      .setParameter('oneWeekAgo', oneWeekAgo)
      .getRawOne();

    const totalPosts = Number(stats.totalPosts || 0);
    const published = Number(stats.published || 0);
    const publishedThisWeek = Number(stats.publishedThisWeek || 0);
    const drafts = Number(stats.drafts || 0);

    const totalViews = 0;

    return {
      totalPosts: {
        value: totalPosts,
        label: 'All time records',
      },
      published: {
        value: published,
        addedThisWeek: publishedThisWeek,
        label: `+${publishedThisWeek} this week`,
      },
      drafts: {
        value: drafts,
        label: 'Pending review',
      },
      totalViews: {
        value: totalViews,
        displayValue: '0',
        growthRatePercent: 0,
        label: 'Requires a view count column in the database',
      },
    };
  }

  // ────────────────── SANITIZE HELPERS ──────────────────

  private sanitizeAuthor(author: User) {
    return {
      id: author.id,
      fullLegalName: author.fullLegalName,
      medicalEmail: author.medicalEmail,
      professionalRole: author.professionalRole,
    };
  }

  private sanitizePublicAuthor(author: User) {
    return {
      id: author.id,
      fullLegalName: author.fullLegalName,
      professionalRole: author.professionalRole,
      profilePhotoUrl: author.profilePhotoUrl,
    };
  }

  private sanitize(post: BlogPost) {
    return {
      ...post,
      authors: post.authors?.map((a) => this.sanitizeAuthor(a)) ?? [],
      authorName: post.authorName ?? null,
    };
  }

  private formatReadCount(readCount: number): string {
    const count = Number.isFinite(readCount) ? Math.max(0, readCount) : 0;
    if (count < 1000) return `${count}`;
    if (count < 1000000) {
      const k = count / 1000;
      const rounded = k >= 10 ? k.toFixed(0) : k.toFixed(1);
      return `${rounded.replace(/\.0$/, '')}k`;
    }
    const m = count / 1000000;
    const rounded = m >= 10 ? m.toFixed(0) : m.toFixed(1);
    return `${rounded.replace(/\.0$/, '')}m`;
  }

  private toPublicBlogCard(post: BlogPost) {
    return {
      id: post.id,
      title: post.title,
      description: post.excerpt || post.content?.substring(0, 200),
      coverImageUrl: post.coverImages ?? [],
      authorName: post.authorName ?? (post.authors?.[0]?.fullLegalName ?? null),
      categories:
        post.categories?.map((cat) => ({
          id: cat.id,
          name: cat.name,
        })) ?? [],
      authors:
        post.authors?.map((author) => this.sanitizePublicAuthor(author)) ?? [],
      readTimeMinutes: post.readTimeMinutes,
      readCount: post.readCount ?? 0,
      readBy: this.formatReadCount(post.readCount ?? 0),
      publishedAt: post.publishedAt,
      isFeatured: post.isFeatured,
    };
  }

  // ────────────────── CREATE ──────────────────

  async create(dto: CreateBlogPostDto) {
    if (
      dto.publishingStatus === PublishingStatus.SCHEDULED &&
      !dto.scheduledPublishDate
    ) {
      throw new BadRequestException(
        "scheduledPublishDate is required when publishingStatus is 'scheduled'",
      );
    }

    let categories: BlogCategory[] = [];
    if (dto.categoryIds?.length) {
      categories = await this.categoryRepo.findBy({ id: In(dto.categoryIds) });
      if (categories.length !== dto.categoryIds.length) {
        throw new BadRequestException('One or more categoryIds are invalid');
      }
    }

    let tags: Tag[] = [];
    if (dto.tagIds?.length) {
      tags = await this.tagRepo.findBy({ id: In(dto.tagIds) });
      if (tags.length !== dto.tagIds.length) {
        throw new BadRequestException('One or more tagIds are invalid');
      }
    }

    const publishedAt =
      dto.publishingStatus === PublishingStatus.PUBLISHED
        ? new Date()
        : undefined;

    const post = this.postRepo.create({
      title: dto.title,
      content: dto.content,
      coverImages: dto.coverImageUrl,
      authorName: dto.authorName?.trim() || undefined,
      publishingStatus: dto.publishingStatus ?? PublishingStatus.DRAFT,
      scheduledPublishDate: dto.scheduledPublishDate
        ? new Date(dto.scheduledPublishDate)
        : undefined,
      isFeatured: dto.isFeatured ?? false,
      excerpt: dto.excerpt,
      readTimeMinutes: dto.readTimeMinutes ?? 5,
      publishedAt,
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
      relations: ['authors', 'categories', 'tags', 'seo'],
    });
    if (!post) throw new NotFoundException('Blog post not found');

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

    if (dto.title !== undefined) post.title = dto.title;
    if (dto.content !== undefined) post.content = dto.content;
    if (dto.coverImageUrl !== undefined) post.coverImages = dto.coverImageUrl;
    if (dto.authorName !== undefined) post.authorName = dto.authorName?.trim() || undefined;
    if (dto.publishingStatus !== undefined)
      post.publishingStatus = dto.publishingStatus;
    if (dto.scheduledPublishDate !== undefined)
      post.scheduledPublishDate = new Date(dto.scheduledPublishDate);
    if (dto.isFeatured !== undefined) post.isFeatured = dto.isFeatured;
    if (dto.excerpt !== undefined) post.excerpt = dto.excerpt;

    if (
      dto.publishingStatus === PublishingStatus.PUBLISHED &&
      !post.publishedAt
    ) {
      post.publishedAt = new Date();
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

    if (
      dto.seoMetaTitle !== undefined ||
      dto.seoMetaDescription !== undefined
    ) {
      if (!post.seo) {
        post.seo = this.seoRepo.create({ postId: post.id });
      }
      if (dto.seoMetaTitle !== undefined) post.seo.metaTitle = dto.seoMetaTitle;
      if (dto.seoMetaDescription !== undefined)
        post.seo.metaDescription = dto.seoMetaDescription;
    }

    return this.sanitize(await this.postRepo.save(post));
  }

  // ────────────────── GET ONE ──────────────────

  async findOne(id: string) {
    const post = await this.postRepo.findOne({
      where: { id },
      relations: ['authors', 'categories', 'tags', 'seo'],
    });
    if (!post) throw new NotFoundException('Blog post not found');
    return this.sanitize(post);
  }

  // ────────────────── LIST ──────────────────

  async findAll(query: ListBlogPostsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const qb = this.postRepo
      .createQueryBuilder('post')
      .leftJoinAndSelect('post.authors', 'author')
      .leftJoinAndSelect('post.categories', 'category')
      .leftJoinAndSelect('post.tags', 'tag')
      .leftJoinAndSelect('post.seo', 'seo');

    if (query.status) {
      qb.andWhere('post.publishingStatus = :status', { status: query.status });
    }
    if (query.categoryId) {
      qb.andWhere('category.id = :categoryId', {
        categoryId: query.categoryId,
      });
    }
    if (query.tagId) {
      qb.andWhere('tag.id = :tagId', { tagId: query.tagId });
    }
    if (query.search?.trim()) {
      const s = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(post.title) LIKE :s OR LOWER(post.excerpt) LIKE :s)',
        { s },
      );
    }

    const countsRaw = await this.postRepo
      .createQueryBuilder('p')
      .select([
        'COUNT(*) AS all',
        `COUNT(*) FILTER (WHERE p."publishingStatus" = 'draft') AS draft`,
        `COUNT(*) FILTER (WHERE p."publishingStatus" = 'scheduled') AS scheduled`,
        `COUNT(*) FILTER (WHERE p."publishingStatus" = 'published') AS published`,
      ])
      .getRawOne();

    qb.orderBy('post.createdAt', 'DESC').skip(skip).take(limit);
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
    if (!post) throw new NotFoundException('Blog post not found');
    await this.postRepo.remove(post);
    return { deleted: true };
  }

  // ────────────────── PUBLIC ENDPOINTS ──────────────────

  async findAllPublic(query: ListPublicBlogsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const qb = this.postRepo
      .createQueryBuilder('post')
      .leftJoinAndSelect('post.authors', 'authors')
      .leftJoinAndSelect('post.categories', 'categories')
      .leftJoinAndSelect('post.tags', 'tags')
      .where('post.publishingStatus = :status', {
        status: PublishingStatus.PUBLISHED,
      });

    if (query.search?.trim()) {
      const s = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(post.title) LIKE :s OR LOWER(post.excerpt) LIKE :s OR LOWER(post.content) LIKE :s)',
        { s },
      );
    }
    if (query.categoryId?.trim()) {
      qb.andWhere('categories.id = :categoryId', {
        categoryId: query.categoryId,
      });
    }

    switch (query.sortBy) {
      case 'oldest':
        qb.orderBy('post.publishedAt', 'ASC');
        break;
      case 'featured':
        qb.orderBy('post.isFeatured', 'DESC').addOrderBy(
          'post.publishedAt',
          'DESC',
        );
        break;
      case 'latest':
      default:
        qb.orderBy('post.publishedAt', 'DESC');
        break;
    }

    const [posts, total] = await qb.skip(skip).take(limit).getManyAndCount();

    return {
      items: posts.map((post) => this.toPublicBlogCard(post)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOnePublic(id: string) {
    const post = await this.postRepo.findOne({
      where: { id, publishingStatus: PublishingStatus.PUBLISHED },
      relations: ['authors', 'categories', 'tags', 'seo'],
    });

    if (!post)
      throw new NotFoundException('Blog post not found or not published');

    await this.postRepo.increment({ id: post.id }, 'readCount', 1);
    const updatedReadCount = (post.readCount ?? 0) + 1;

    return {
      id: post.id,
      title: post.title,
      content: post.content,
      description: post.excerpt,
      coverImageUrl: post.coverImages ?? [],
      authorName: post.authorName ?? (post.authors?.[0]?.fullLegalName ?? null),
      categories:
        post.categories?.map((cat) => ({ id: cat.id, name: cat.name })) ?? [],
      tags: post.tags?.map((tag) => ({ id: tag.id, name: tag.name })) ?? [],
      authors:
        post.authors?.map((author) => this.sanitizePublicAuthor(author)) ?? [],
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
      .createQueryBuilder('post')
      .leftJoinAndSelect('post.authors', 'authors')
      .leftJoinAndSelect('post.categories', 'categories')
      .where('post.publishingStatus = :status', {
        status: PublishingStatus.PUBLISHED,
      })
      .orderBy('post.readCount', 'DESC')
      .addOrderBy('post.publishedAt', 'DESC')
      .take(limit)
      .getMany();

    return {
      items: posts.map((post) => this.toPublicBlogCard(post)),
      meta: { limit, total: posts.length },
    };
  }

  // ────────────────── PUBLICATION CALENDAR ──────────────────

  async getCalendarEvents(
    startDate: string,
    endDate: string,
  ): Promise<Record<string, unknown>> {
    const qb = this.postRepo
      .createQueryBuilder('post')
      .leftJoinAndSelect('post.authors', 'author')
      .leftJoinAndSelect('post.categories', 'category')
      .where('post.publishingStatus IN (:...statuses)', {
        statuses: ['scheduled', 'published'],
      })
      .andWhere(
        '(post.scheduledPublishDate BETWEEN :start AND :end OR post.publishedAt BETWEEN :start AND :end)',
        { start: new Date(startDate), end: new Date(endDate) },
      );

    const posts = await qb.getMany();

    const postIds = posts.map((p) => p.id);
    let distributedPostIds = new Set<string>();

    if (postIds.length > 0) {
      const distributedLinks = await this.articleLinkRepo.find({
        where: { sourceRefId: In(postIds) },
        select: ['sourceRefId'],
      });
      distributedPostIds = new Set(
        distributedLinks.map((link) => link.sourceRefId),
      );
    }

    return {
      items: posts.map((p) => {
        const isPublished = p.publishingStatus === 'published';
        const eventDate = isPublished ? p.publishedAt : p.scheduledPublishDate;

        return {
          id: p.id,
          title: p.title,
          status: p.publishingStatus,
          date: eventDate,
          category: p.categories?.[0]?.name || 'UNCATEGORIZED',
          author: p.authors?.[0]
            ? {
                name: p.authors[0].fullLegalName,
                initials: p.authors[0].fullLegalName
                  ?.substring(0, 2)
                  .toUpperCase(),
                role: p.authors[0].professionalRole || null,
              }
            : null,
          distribution: {
            internalPortal: true,
            newsletterBlast: distributedPostIds.has(p.id),
          },
        };
      }),
    };
  }

  async getUnscheduledDrafts(): Promise<Record<string, unknown>> {
    const [drafts, total] = await this.postRepo.findAndCount({
      where: { publishingStatus: 'draft' as any },
      relations: ['authors', 'categories'],
      order: { updatedAt: 'DESC' },
      take: 50,
    });

    return {
      total,
      items: drafts.map((p) => ({
        id: p.id,
        title: p.title,
        category: p.categories?.[0]?.name || 'UNCATEGORIZED',
        author: p.authors?.[0]
          ? {
              name: p.authors[0].fullLegalName,
              initials: p.authors[0].fullLegalName
                ?.substring(0, 2)
                .toUpperCase(),
            }
          : null,
        lastSaved: p.updatedAt,
      })),
    };
  }

  async quickSchedule(
    id: string,
    dto: SchedulePostDto,
  ): Promise<Record<string, unknown>> {
    const post = await this.postRepo.findOne({ where: { id } });
    if (!post) throw new NotFoundException('Blog post not found');

    post.publishingStatus = 'scheduled' as any;
    post.scheduledPublishDate = new Date(dto.scheduledPublishDate);

    await this.postRepo.save(post);

    return {
      message: 'Publication scheduled successfully',
      id: post.id,
      status: post.publishingStatus,
      scheduledPublishDate: post.scheduledPublishDate,
    };
  }

  async unschedulePost(id: string): Promise<Record<string, unknown>> {
    const post = await this.postRepo.findOne({ where: { id } });
    if (!post) throw new NotFoundException('Blog post not found');

    post.publishingStatus = 'draft' as any;
    post.scheduledPublishDate = null as any;
    post.publishedAt = null as any;

    await this.postRepo.save(post);

    return {
      message: 'Post reverted to unscheduled draft',
      id: post.id,
      status: post.publishingStatus,
    };
  }

  async exportCalendar(
    startDate: string,
    endDate: string,
  ): Promise<Record<string, unknown>> {
    const data = await this.getCalendarEvents(startDate, endDate);
    const items = data.items as any[];

    return {
      message: 'Schedule export generated',
      filename: `publication_schedule_${startDate.split('T')[0]}_to_${endDate.split('T')[0]}.csv`,
      data: items.map((i) => ({
        ID: i.id,
        Title: i.title,
        Status: i.status.toUpperCase(),
        Date: new Date(i.date).toISOString(),
        Category: i.category,
        Author: i.author?.name || 'N/A',
        InNewsletter: i.distribution.newsletterBlast ? 'Yes' : 'No',
      })),
    };
  }
}
