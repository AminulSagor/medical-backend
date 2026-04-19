import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, In } from 'typeorm';

import { BlogPost } from './entities/blog-post.entity';
// Import these from your Newsletter module paths
import { NewsletterBroadcast } from 'src/newsletters/broadcasts/entities/newsletter-broadcast.entity';
import { NewsletterBroadcastArticleLink } from 'src/newsletters/broadcasts/entities/newsletter-broadcast-article-link.entity';
import { NewsletterSubscriber } from 'src/newsletters/audience/entities/newsletter-subscriber.entity';
import {
  NewsletterBroadcastStatus,
  NewsletterChannelType,
  NewsletterContentType,
  NewsletterSubscriberStatus,
} from 'src/common/enums/newsletter-constants.enum';

import {
  DistributeBlastDto,
  DistributeCohortsDto,
  DistributeNewsletterDto,
} from './dto/blog-distribution.dto';

@Injectable()
export class BlogDistributionService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(BlogPost)
    private readonly postRepo: Repository<BlogPost>,
    @InjectRepository(NewsletterBroadcast)
    private readonly broadcastRepo: Repository<NewsletterBroadcast>,
    @InjectRepository(NewsletterBroadcastArticleLink)
    private readonly articleLinkRepo: Repository<NewsletterBroadcastArticleLink>,
    @InjectRepository(NewsletterSubscriber)
    private readonly subscriberRepo: Repository<NewsletterSubscriber>,
  ) {}

  // ────────────────── PRE-FLIGHT (MODAL DATA) ──────────────────

  async getDistributionOptions(
    postId: string,
  ): Promise<Record<string, unknown>> {
    const post = await this.postRepo.findOne({ where: { id: postId } });
    if (!post) throw new NotFoundException('Blog post not found');

    // 1. Get total active subscribers for Email Blast
    const totalSubscribers = await this.subscriberRepo.count({
      where: { status: NewsletterSubscriberStatus.ACTIVE },
    });

    // 2. Get Next Upcoming Campaigns for Newsletter Queue
    const nextWeekly = this.calculateNextDeliveryDate('WEEKLY');
    const nextMonthly = this.calculateNextDeliveryDate('MONTHLY');

    // Count how many items are already queued for these dates (Mocked queue logic based on scheduled broadcasts)
    const weeklyQueueCount = await this.broadcastRepo.count({
      where: {
        frequencyType: 'WEEKLY' as any,
        status: In([
          NewsletterBroadcastStatus.DRAFT,
          NewsletterBroadcastStatus.SCHEDULED,
        ]),
      },
    });

    const monthlyQueueCount = await this.broadcastRepo.count({
      where: {
        frequencyType: 'MONTHLY' as any,
        status: In([
          NewsletterBroadcastStatus.DRAFT,
          NewsletterBroadcastStatus.SCHEDULED,
        ]),
      },
    });

    // 3. Get Active Cohorts for Course Trainees
    // NOTE: This should ideally join with your Courses module.
    // Providing the exact payload structure expected by your UI.
    const activeCohorts = [
      {
        id: 'c1',
        name: 'Advanced Airway Management',
        date: 'March 12, 2026',
        students: 24,
      },
      {
        id: 'c2',
        name: 'Pediatric Intubation Masters',
        date: 'April 05, 2026',
        students: 18,
      },
      {
        id: 'c3',
        name: 'Critical Care Ventilation',
        date: 'May 14, 2026',
        students: 32,
      },
      {
        id: 'c4',
        name: 'Emergency RSI Techniques',
        date: 'June 22, 2026',
        students: 15,
      },
    ];

    return {
      articleSnapshot: {
        title: post.title,
        subjectLinePreview: `New Clinical Update: ${post.title}`,
      },
      blastDetails: {
        targetAudience: 'General Subscribers',
        totalRecipients: totalSubscribers,
      },
      newsletterQueueDetails: {
        weekly: { nextDate: nextWeekly, articlesInQueue: weeklyQueueCount },
        monthly: { nextDate: nextMonthly, articlesInQueue: monthlyQueueCount },
      },
      courseCohorts: activeCohorts,
    };
  }

  // ────────────────── EXECUTION ENDPOINTS ──────────────────

  async distributeViaBlast(
    adminUserId: string,
    postId: string,
    dto: DistributeBlastDto,
  ): Promise<Record<string, unknown>> {
    const post = await this.postRepo.findOne({
      where: { id: postId },
      relations: ['authors'],
    });
    if (!post) throw new NotFoundException('Blog post not found');

    const savedBroadcast = await this.dataSource.transaction(
      async (manager) => {
        // 1. Create the Broadcast
        const broadcast = manager.create(NewsletterBroadcast, {
          channelType: NewsletterChannelType.GENERAL,
          contentType: NewsletterContentType.ARTICLE_LINK,
          internalName: `Blast: ${post.title}`,
          subjectLine: `New Clinical Update: ${post.title}`,
          status: NewsletterBroadcastStatus.SCHEDULED, // Trigger immediate send
          scheduledAt: new Date(), // Immediate
          audienceMode: 'ALL_SUBSCRIBERS' as any,
          createdByAdminId: adminUserId,
          updatedByAdminId: adminUserId,
        });

        const saved = await manager.save(NewsletterBroadcast, broadcast);

        // 2. Attach the Article Snapshot
        const link = manager.create(NewsletterBroadcastArticleLink, {
          broadcastId: saved.id,
          sourceType: 'BLOG_POST' as any,
          sourceRefId: post.id,
          sourceTitleSnapshot: post.title,
          sourceExcerptSnapshot: post.excerpt || '',
          sourceAuthorSnapshot:
            post.authorName || post.authors?.[0]?.fullLegalName || 'Texas Airway Institute',
          sourceHeroImageUrlSnapshot:
            post.coverImages?.[0]?.imageUrl ?? null,
          sourcePublishedAtSnapshot: post.publishedAt || new Date(),
          ctaLabel: 'Read Full Analysis',
        });
        await manager.save(NewsletterBroadcastArticleLink, link);

        return saved;
      },
    );

    return {
      message: 'Email blast scheduled successfully',
      broadcastId: savedBroadcast.id,
      audience: 'General Subscribers',
      sendAdminCopy: dto.sendAdminCopy ?? false,
    };
  }

  async distributeViaNewsletterQueue(
    adminUserId: string,
    postId: string,
    dto: DistributeNewsletterDto,
  ): Promise<Record<string, unknown>> {
    const post = await this.postRepo.findOne({
      where: { id: postId },
      relations: ['authors'],
    });
    if (!post) throw new NotFoundException('Blog post not found');

    const nextDate = this.calculateNextDeliveryDate(dto.frequencyType);
    const newsletterName =
      dto.frequencyType === 'MONTHLY'
        ? `${nextDate.toLocaleString('default', { month: 'long', year: 'numeric' })} Clinical Digest`
        : `Weekly Clinical Briefing`;

    const savedBroadcast = await this.dataSource.transaction(
      async (manager) => {
        // Create a scheduled digest broadcast
        const broadcast = manager.create(NewsletterBroadcast, {
          channelType: NewsletterChannelType.GENERAL,
          contentType: NewsletterContentType.ARTICLE_LINK,
          frequencyType: dto.frequencyType as any,
          internalName: newsletterName,
          subjectLine: newsletterName,
          status: NewsletterBroadcastStatus.SCHEDULED,
          scheduledAt: nextDate,
          audienceMode: 'ALL_SUBSCRIBERS' as any,
          createdByAdminId: adminUserId,
          updatedByAdminId: adminUserId,
        });

        const saved = await manager.save(NewsletterBroadcast, broadcast);

        // Attach Article Snapshot
        const link = manager.create(NewsletterBroadcastArticleLink, {
          broadcastId: saved.id,
          sourceType: 'BLOG_POST' as any,
          sourceRefId: post.id,
          sourceTitleSnapshot: post.title,
          sourceExcerptSnapshot: post.excerpt || '',
          sourceAuthorSnapshot:
            post.authorName || post.authors?.[0]?.fullLegalName || 'Texas Airway Institute',
          sourceHeroImageUrlSnapshot:
            post.coverImages?.[0]?.imageUrl ?? null,
          sourcePublishedAtSnapshot: post.publishedAt || new Date(),
          ctaLabel: 'Read Full Analysis',
        });
        await manager.save(NewsletterBroadcastArticleLink, link);

        return saved;
      },
    );

    return {
      message: 'Successfully added to newsletter queue',
      newsletterName,
      queuePosition: 1, // Logic can be expanded to count existing
      scheduledDate: nextDate,
    };
  }

  async distributeToCohorts(
    adminUserId: string,
    postId: string,
    dto: DistributeCohortsDto,
  ): Promise<Record<string, unknown>> {
    const post = await this.postRepo.findOne({
      where: { id: postId },
      relations: ['authors'],
    });
    if (!post) throw new NotFoundException('Blog post not found');

    const savedBroadcast = await this.dataSource.transaction(
      async (manager) => {
        const broadcast = manager.create(NewsletterBroadcast, {
          channelType: NewsletterChannelType.COURSE_ANNOUNCEMENT,
          contentType: NewsletterContentType.ARTICLE_LINK,
          internalName: `Cohort Update: ${post.title}`,
          subjectLine: `Course Resource: ${post.title}`,
          status: NewsletterBroadcastStatus.SCHEDULED,
          scheduledAt: new Date(), // Send immediately
          audienceMode: 'SEGMENTS' as any,
          createdByAdminId: adminUserId,
          updatedByAdminId: adminUserId,
        });

        const saved = await manager.save(NewsletterBroadcast, broadcast);

        // Note: You would normally map dto.cohortIds to NewsletterBroadcastSegment here.
        // Assuming that logic relies on your Cohorts module.

        const link = manager.create(NewsletterBroadcastArticleLink, {
          broadcastId: saved.id,
          sourceType: 'BLOG_POST' as any,
          sourceRefId: post.id,
          sourceTitleSnapshot: post.title,
          sourceExcerptSnapshot: post.excerpt || '',
          sourceAuthorSnapshot:
            post.authorName || post.authors?.[0]?.fullLegalName || 'Texas Airway Institute',
          sourceHeroImageUrlSnapshot:
            post.coverImages?.[0]?.imageUrl ?? null,
          sourcePublishedAtSnapshot: post.publishedAt || new Date(),
          ctaLabel: 'View Course Material',
        });
        await manager.save(NewsletterBroadcastArticleLink, link);

        return saved;
      },
    );

    return {
      message: 'Article distributed to target cohorts successfully',
      broadcastId: savedBroadcast.id,
      cohortsTargeted: dto.cohortIds.length,
    };
  }

  // ────────────────── HELPER METHODS ──────────────────

  private calculateNextDeliveryDate(frequency: 'WEEKLY' | 'MONTHLY'): Date {
    const date = new Date();
    if (frequency === 'WEEKLY') {
      // Find next Sunday
      date.setDate(date.getDate() + ((7 - date.getDay()) % 7 || 7));
      date.setHours(9, 0, 0, 0); // Default to 9:00 AM
    } else if (frequency === 'MONTHLY') {
      // Find First Monday of Next Month
      date.setMonth(date.getMonth() + 1, 1);
      while (date.getDay() !== 1) {
        date.setDate(date.getDate() + 1);
      }
      date.setHours(9, 0, 0, 0);
    }
    return date;
  }
}
