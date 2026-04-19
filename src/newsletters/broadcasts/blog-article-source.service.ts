import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  BlogPost,
  PublishingStatus,
} from '../../blog/entities/blog-post.entity';
import { NewsletterArticleSourceType } from '../../common/enums/newsletter-constants.enum';

export type ArticleSourceSearchItem = {
  sourceType: NewsletterArticleSourceType;
  sourceRefId: string;

  title: string;
  excerpt: string | null;

  authorName: string | null;
  heroImageUrl: string | null;

  publishedAt: string | null; // ISO
  estimatedReadMinutes: number | null;

  // UI badge helper (optional)
  kindLabel: 'Clinical Article' | 'Special Report';
};

export type BlogPostSnapshot = {
  sourceType: NewsletterArticleSourceType.BLOG_POST;
  sourceRefId: string;

  title: string;
  excerpt: string | null;

  authorName: string | null;
  heroImageUrl: string | null;

  publishedAt: Date | null;
  estimatedReadMinutes: number | null;

  kindLabel: 'Clinical Article' | 'Special Report';
};

@Injectable()
export class BlogArticleSourceService {
  constructor(
    @InjectRepository(BlogPost)
    private readonly blogPostRepo: Repository<BlogPost>,
  ) {}

  async searchPublished(params: {
    search?: string;
    page: number;
    limit: number;
  }): Promise<{
    items: ArticleSourceSearchItem[];
    meta: { page: number; limit: number; total: number };
  }> {
    const page = params.page;
    const limit = params.limit;
    const skip = (page - 1) * limit;

    const qb = this.blogPostRepo
      .createQueryBuilder('post')
      .leftJoinAndSelect('post.authors', 'author')
      .leftJoinAndSelect('post.categories', 'category')
      .leftJoinAndSelect('post.tags', 'tag')
      .leftJoinAndSelect('post.seo', 'seo')
      .where('post.publishingStatus = :status', {
        status: PublishingStatus.PUBLISHED,
      });

    if (params.search?.trim()) {
      const s = `%${params.search.trim().toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(post.title) LIKE :s OR LOWER(post.excerpt) LIKE :s)',
        { s },
      );
    }

    qb.orderBy('post.publishedAt', 'DESC').skip(skip).take(limit);

    const [posts, total] = await qb.getManyAndCount();

    return {
      items: posts.map((p) => {
        const snapshot = this.toSnapshot(p);
        return {
          sourceType: snapshot.sourceType,
          sourceRefId: snapshot.sourceRefId,
          title: snapshot.title,
          excerpt: snapshot.excerpt,
          authorName: snapshot.authorName,
          heroImageUrl: snapshot.heroImageUrl,
          publishedAt: snapshot.publishedAt
            ? snapshot.publishedAt.toISOString()
            : null,
          estimatedReadMinutes: snapshot.estimatedReadMinutes,
          kindLabel: snapshot.kindLabel,
        };
      }),
      meta: { page, limit, total },
    };
  }

  async getPublishedSnapshotOrThrow(postId: string): Promise<BlogPostSnapshot> {
    const post = await this.blogPostRepo.findOne({
      where: { id: postId },
      relations: ['authors', 'categories', 'tags', 'seo'],
    });

    if (!post) throw new NotFoundException('Blog post not found');
    if (post.publishingStatus !== PublishingStatus.PUBLISHED) {
      throw new BadRequestException('Selected article must be published');
    }

    return this.toSnapshot(post);
  }

  private toSnapshot(post: BlogPost): BlogPostSnapshot {
    const authorName =
      post.authorName ||
      (post.authors?.length
        ? post.authors
            .map((a: any) => a.fullLegalName ?? a.medicalEmail ?? a.id)
            .join(', ')
        : null);

    const kindLabel = this.deriveKindLabel(post);
    const estimatedReadMinutes = this.estimateReadMinutes(post.content);

    return {
      sourceType: NewsletterArticleSourceType.BLOG_POST,
      sourceRefId: post.id,
      title: post.title,
      excerpt: post.excerpt ?? null,
      authorName,
      heroImageUrl: post.coverImages?.[0]?.imageUrl ?? null,
      publishedAt: post.publishedAt ?? null,
      estimatedReadMinutes,
      kindLabel,
    };
  }

  private deriveKindLabel(
    post: BlogPost,
  ): 'Clinical Article' | 'Special Report' {
    const isSpecial =
      post.categories?.some(
        (c: any) => /special/i.test(c.name) || /special/i.test(c.slug),
      ) || post.tags?.some((t: any) => /special/i.test(t.name));

    return isSpecial ? 'Special Report' : 'Clinical Article';
  }

  private estimateReadMinutes(content: string): number | null {
    const text = (content ?? '').trim();
    if (!text) return null;

    const words = text.split(/\s+/g).filter(Boolean).length;
    // 180 wpm typical
    return Math.max(1, Math.round(words / 180));
  }
}
