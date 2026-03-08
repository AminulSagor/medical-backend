import { Injectable, NotFoundException } from '@nestjs/common';

/**
 * Replace internals with actual integration to your Blogs/Posts module/repository.
 * Keep response shape stable for newsletter UI.
 */
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
  async searchPublishedArticles(input: {
    query: string;
    page: number;
    limit: number;
  }): Promise<{ items: ArticleSourceSearchItem[]; total: number }> {
    // TODO: Replace with real blog/article module query.
    // Example integration target: blog_posts table with published status.
    return { items: [], total: 0 };
  }

  async getPublishedArticleSnapshot(input: {
    sourceType: string;
    sourceRefId: string;
  }): Promise<ArticleSourceSnapshot> {
    // TODO: Replace with real lookup.
    // Throw if not found / unpublished.
    throw new NotFoundException('Published article source not found');
  }
}
