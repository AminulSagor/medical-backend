import { Injectable, NotFoundException } from '@nestjs/common';
import { BlogArticleSourceService } from './blog-article-source.service';

export interface ArticleSourceSearchItem {
  sourceRefId: string;
  sourceType: string;
  title: string;
  excerpt: string | null;
  authorName: string | null;
  heroImageUrl: string | null;
  publishedAt: string | null;
  estimatedReadMinutes: number | null;
  isPublished: boolean;
}

export interface ArticleSourceSnapshot {
  sourceRefId: string;
  sourceType: string;
  title: string;
  excerpt: string | null;
  authorName: string | null;
  heroImageUrl: string | null;
  publishedAt: Date | null;
  estimatedReadMinutes: number | null;
  ctaDefaultLabel: string;
  isPublished: boolean;
}

@Injectable()
export class ArticleSourceAdapterService {
  constructor(private readonly blogSource: BlogArticleSourceService) {}

  async searchPublishedArticles(input: {
    query: string;
    page: number;
    limit: number;
  }): Promise<{ items: ArticleSourceSearchItem[]; total: number }> {
    // 1. Pass parameters as an object to match the service definition
    const result = await this.blogSource.searchPublished({
      search: input.query,
      page: input.page,
      limit: input.limit,
    });

    // 2. Flatten the response to extract 'total' from the 'meta' object
    return {
      items: result.items.map((item) => ({
        ...item,
        isPublished: true, // Required by ArticleSourceSearchItem interface
      })),
      total: result.meta.total,
    };
  }

  async getPublishedArticleSnapshot(input: {
    sourceType: string;
    sourceRefId: string;
  }): Promise<ArticleSourceSnapshot> {
    // 3. Use the correct method name: getPublishedSnapshotOrThrow
    const snapshot = await this.blogSource.getPublishedSnapshotOrThrow(
      input.sourceRefId,
    );

    return {
      ...snapshot,
      ctaDefaultLabel: 'Read Full Article',
      isPublished: true,
    } as any;
  }
}
