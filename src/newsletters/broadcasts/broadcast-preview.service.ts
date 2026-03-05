import { Injectable } from '@nestjs/common';
import { BroadcastComposerService } from './broadcast-composer.service';
import { NewsletterBroadcast } from './entities/newsletter-broadcast.entity';

@Injectable()
export class BroadcastPreviewService {
  constructor(private readonly composer: BroadcastComposerService) {}

  buildPreviewPayload(
    broadcast: NewsletterBroadcast,
    customContent?: {
      messageBodyHtml: string;
      messageBodyText?: string | null;
    } | null,
    articleLink?: {
      sourceTitleSnapshot: string;
      sourceExcerptSnapshot?: string | null;
      sourceHeroImageUrlSnapshot?: string | null;
      ctaLabel?: string | null;
    } | null,
  ): Record<string, unknown> {
    if (broadcast.contentType === 'CUSTOM_MESSAGE') {
      return {
        html: this.composer.buildCustomMessagePreviewHtml({
          subjectLine: broadcast.subjectLine,
          preheaderText: broadcast.preheaderText,
          messageBodyHtml: customContent?.messageBodyHtml ?? '',
        }),
      };
    }

    return {
      html: this.composer.buildArticlePreviewHtml({
        subjectLine: broadcast.subjectLine,
        articleTitle: articleLink?.sourceTitleSnapshot ?? 'Article',
        excerpt: articleLink?.sourceExcerptSnapshot ?? null,
        ctaLabel: articleLink?.ctaLabel ?? 'Read Full Article',
        heroImageUrl: articleLink?.sourceHeroImageUrlSnapshot ?? null,
        articleUrl: null,
      }),
    };
  }
}
