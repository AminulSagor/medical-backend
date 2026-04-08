import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, LessThan, Like, Repository } from 'typeorm';

import { NewsletterBroadcast } from 'src/newsletters/broadcasts/entities/newsletter-broadcast.entity';
import { NewsletterBroadcastArticleLink } from 'src/newsletters/broadcasts/entities/newsletter-broadcast-article-link.entity';
import { NewsletterBroadcastCustomContent } from 'src/newsletters/broadcasts/entities/newsletter-broadcast-custom-content.entity';
import { NewsletterBroadcastAttachment } from 'src/newsletters/broadcasts/entities/newsletter-broadcast-attachment.entity';

import { NewsletterDeliveryRecipient } from 'src/newsletters/delivery/entities/newsletter-delivery-recipient.entity';
import { NewsletterTransmissionEvent } from 'src/newsletters/delivery/entities/newsletter-transmission-event.entity';

import { NewsletterSubscriber } from 'src/newsletters/audience/entities/newsletter-subscriber.entity';

import {
  NewsletterBroadcastStatus,
  NewsletterChannelType,
  NewsletterDeliveryRecipientStatus,
} from 'src/common/enums/newsletter-constants.enum';

import { ListTransmissionsQueryDto } from './dto/list-transmissions-query.dto';
import { ArchiveTransmissionsDto } from './dto/archive-transmissions.dto';
import { ListTransmissionRecipientsQueryDto } from './dto/list-transmission-recipients-query.dto';
import { NewsletterUnsubscribeRequest } from '../unsubscribe/entities/newsletter-unsubscribe-request.entity';

@Injectable()
export class TransmissionsService {
  constructor(
    @InjectRepository(NewsletterBroadcast)
    private readonly broadcastRepo: Repository<NewsletterBroadcast>,

    @InjectRepository(NewsletterBroadcastArticleLink)
    private readonly articleLinkRepo: Repository<NewsletterBroadcastArticleLink>,

    @InjectRepository(NewsletterBroadcastCustomContent)
    private readonly customContentRepo: Repository<NewsletterBroadcastCustomContent>,

    @InjectRepository(NewsletterBroadcastAttachment)
    private readonly attachmentRepo: Repository<NewsletterBroadcastAttachment>,

    @InjectRepository(NewsletterDeliveryRecipient)
    private readonly recipientRepo: Repository<NewsletterDeliveryRecipient>,

    @InjectRepository(NewsletterTransmissionEvent)
    private readonly eventRepo: Repository<NewsletterTransmissionEvent>,

    @InjectRepository(NewsletterUnsubscribeRequest)
    private readonly unsubRepo: Repository<NewsletterUnsubscribeRequest>,
  ) {}

  async list(
    query: ListTransmissionsQueryDto,
  ): Promise<Record<string, unknown>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const now = new Date();
    const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const qb = this.broadcastRepo
      .createQueryBuilder('b')
      .where('b.status = :status', { status: NewsletterBroadcastStatus.SENT });

    if (query.search?.trim()) {
      const s = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere(
        `(LOWER(b.subjectLine) LIKE :s OR LOWER(COALESCE(b.internalName,'')) LIKE :s)`,
        { s },
      );
    }

    qb.orderBy('b.sentAt', query.sortOrder ?? 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();

    // 1. CALCULATE ACTUAL GLOBAL METRICS FOR CARDS
    const globalStats = await this.broadcastRepo
      .createQueryBuilder('b')
      .select('COUNT(*)', 'totalSent')
      .addSelect('AVG(CAST(b.openRatePercent AS NUMERIC))', 'avgOpenRate')
      .where('b.status = :status', { status: NewsletterBroadcastStatus.SENT })
      .getRawOne();

    const sentLastWeekCount = await this.broadcastRepo.count({
      where: {
        status: NewsletterBroadcastStatus.SENT,
        sentAt: LessThan(lastWeek),
      },
    });

    const totalSentCount = Number(globalStats.totalSent || 0);
    const growthRate =
      sentLastWeekCount > 0
        ? Number(
            (
              ((totalSentCount - sentLastWeekCount) / sentLastWeekCount) *
              100
            ).toFixed(1),
          )
        : 0;

    // 2. CALCULATE ACTUAL GLOBAL BOUNCE RATE
    const globalBounceStats = await this.recipientRepo
      .createQueryBuilder('r')
      .select('COUNT(*)', 'totalRecipients')
      .addSelect(
        `SUM(CASE WHEN r.deliveryStatus = :bounced THEN 1 ELSE 0 END)`,
        'bouncedCount',
      )
      .setParameter('bounced', NewsletterDeliveryRecipientStatus.BOUNCED)
      .getRawOne();

    const totalRecipientsAllTime = Number(
      globalBounceStats.totalRecipients || 0,
    );
    const globalBounceRate =
      totalRecipientsAllTime > 0
        ? Number(
            (
              (Number(globalBounceStats.bouncedCount) /
                totalRecipientsAllTime) *
              100
            ).toFixed(2),
          )
        : 0;

    return {
      cards: {
        totalSent: {
          value: totalSentCount,
          growthRatePercent: growthRate,
        },
        avgOpenRatePercent: Number(
          Number(globalStats.avgOpenRate || 0).toFixed(1),
        ),
        bounceRatePercent: globalBounceRate,
      },
      items: await Promise.all(
        items.map(async (b) => {
          // Calculate unique click rate for this specific broadcast
          const clickStats = await this.recipientRepo
            .createQueryBuilder('r')
            .select('COUNT(*)', 'total')
            .addSelect(
              'SUM(CASE WHEN r.firstClickedAt IS NOT NULL THEN 1 ELSE 0 END)',
              'clicked',
            )
            .where('r.broadcastId = :id', { id: b.id })
            .getRawOne();

          const bTotal = Number(clickStats.total || 0);
          const bClicked = Number(clickStats.clicked || 0);
          const clickRate =
            bTotal > 0 ? Number(((bClicked / bTotal) * 100).toFixed(1)) : 0;

          return {
            id: b.id,
            status: { code: b.status, label: 'Sent' },
            type: {
              label:
                b.channelType === NewsletterChannelType.COURSE_ANNOUNCEMENT
                  ? 'CLASS UPDATE'
                  : 'NEWSLETTER',
            },
            subject: b.subjectLine,
            targetAudience: 'All Subscribers',
            rates: {
              openRatePercent: Number(b.openRatePercent || 0),
              clickRatePercent: clickRate,
            },
            sentAt: b.sentAt,
            actions: { viewSentContent: true, viewReport: true },
          };
        }),
      ),
      meta: { page, limit, total },
    };
  }

  async getReport(broadcastId: string): Promise<Record<string, unknown>> {
    const b = await this.broadcastRepo.findOne({
      where: { id: broadcastId, status: NewsletterBroadcastStatus.SENT },
    });
    if (!b) throw new NotFoundException('Transmission not found');

    // 1. CALCULATE ACTUAL RECIPIENT ENGAGEMENT
    const stats = await this.recipientRepo
      .createQueryBuilder('r')
      .select('COUNT(*)', 'total')
      .addSelect(
        `SUM(CASE WHEN r.deliveredAt IS NOT NULL THEN 1 ELSE 0 END)`,
        'delivered',
      )
      .addSelect(
        `SUM(CASE WHEN r.firstOpenedAt IS NOT NULL THEN 1 ELSE 0 END)`,
        'opened',
      )
      .addSelect(
        `SUM(CASE WHEN r.firstClickedAt IS NOT NULL THEN 1 ELSE 0 END)`,
        'clicked',
      )
      .where('r.broadcastId = :id', { id: broadcastId })
      .getRawOne();

    const total = Number(stats.total || 0);
    const delivered = Number(stats.delivered || 0);
    const opened = Number(stats.opened || 0);
    const clicked = Number(stats.clicked || 0);

    const deliveryRate = total
      ? Number(((delivered / total) * 100).toFixed(1))
      : 0;
    const openRate = total ? Number(((opened / total) * 100).toFixed(1)) : 0;
    const clickRate = total ? Number(((clicked / total) * 100).toFixed(1)) : 0;

    // 2. CALCULATE ACTUAL ATTRITION (UNSUBSCRIBES LINKED TO THIS BROADCAST)
    // Assumes unsubscription source or notes contains the broadcast ID
    const attritionCount = await this.unsubRepo.count({
      where: [
        { notes: Like(`%broadcastId:${broadcastId}%`) },
        { source: Like(`%${broadcastId}%`) },
      ],
    });
    const attritionPercent =
      total > 0 ? Number(((attritionCount / total) * 100).toFixed(2)) : 0;

    // 3. CALCULATE OPEN RATE GROWTH VS HISTORICAL AVERAGE
    const historicalAvg = await this.broadcastRepo
      .createQueryBuilder('b')
      .select('AVG(CAST(b.openRatePercent AS NUMERIC))', 'avg')
      .where('b.status = :status AND b.id != :id', {
        status: NewsletterBroadcastStatus.SENT,
        id: broadcastId,
      })
      .getRawOne();

    const avgVal = Number(historicalAvg.avg || 0);
    const openRateGrowth =
      avgVal > 0 ? Number((openRate - avgVal).toFixed(1)) : 0;

    // 4. GENERATE ACTUAL ENGAGEMENT BUCKETS (24 HOUR TIMELINE)
    const openData = await this.recipientRepo
      .createQueryBuilder('r')
      .select(['r.firstOpenedAt', 'r.sentAt'])
      .where('r.broadcastId = :id AND r.firstOpenedAt IS NOT NULL', {
        id: broadcastId,
      })
      .getMany();

    const buckets = Array(24).fill(0);
    openData.forEach((r) => {
      if (r.firstOpenedAt && r.sentAt) {
        const diffHours = Math.floor(
          (r.firstOpenedAt.getTime() - r.sentAt.getTime()) / 3600000,
        );
        if (diffHours >= 0 && diffHours < 24) buckets[diffHours]++;
      }
    });

    return {
      cards: {
        deliveryRatePercent: deliveryRate,
        openRate: {
          value: openRate,
          growthRatePercent: openRateGrowth, // Actual comparison vs average
        },
        clickThroughRatePercent: clickRate,
        attritionPercent: attritionPercent,
      },
      engagementOverTime: { unit: 'hour', buckets },
      topPerformingLinks: await this.getTopLinks(broadcastId),
      recipientLog: await this.listRecipients(broadcastId, {
        page: 1,
        limit: 10,
      }),
    };
  }

  private async getTopLinks(broadcastId: string) {
    // 5. CALCULATE ACTUAL TOP LINKS BY CLICK VOLUME
    const clickEvents = await this.eventRepo.find({
      where: { broadcastId, eventType: 'CLICK' as any },
    });

    const counts = new Map<string, number>();
    clickEvents.forEach((e) => {
      if (e.payloadText) {
        try {
          const payload = JSON.parse(e.payloadText);
          const url = payload.url || payload.link;
          if (url) counts.set(url, (counts.get(url) || 0) + 1);
        } catch {}
      }
    });

    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([url, clicks]) => ({ url, clicks }));
  }

  async listRecipients(
    broadcastId: string,
    query: ListTransmissionRecipientsQueryDto,
  ) {
    const qb = this.recipientRepo
      .createQueryBuilder('r')
      .leftJoin(NewsletterSubscriber, 's', 's.id = r.subscriberId')
      .select([
        'r.id',
        'r.emailSnapshot',
        'r.deliveryStatus',
        'r.firstOpenedAt',
        'r.firstClickedAt',
        'r.sentAt',
        's.fullName',
      ])
      .where('r.broadcastId = :id', { id: broadcastId });

    const page = query.page || 1;
    const limit = query.limit || 10;

    const [items, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      items: items.map((r) => ({
        recipient: {
          name: (r as any).s?.fullName || null,
          email: r.emailSnapshot,
        },
        status: r.deliveryStatus,
        timestamp: r.firstClickedAt || r.firstOpenedAt || r.sentAt,
      })),
      meta: { total, page, limit },
    };
  }

  async getSentContent(broadcastId: string): Promise<Record<string, unknown>> {
    const b = await this.broadcastRepo.findOne({ where: { id: broadcastId } });
    if (!b) throw new NotFoundException('Broadcast not found');

    const [articleLink, customContent, attachments] = await Promise.all([
      this.articleLinkRepo.findOne({ where: { broadcastId } }),
      this.customContentRepo.findOne({ where: { broadcastId } }),
      this.attachmentRepo.find({
        where: { broadcastId },
        order: { sortOrder: 'ASC' as any },
      }),
    ]);

    return {
      subjectLine: b.subjectLine,
      sentAt: b.sentAt,
      content: {
        html: customContent?.messageBodyHtml ?? null,
        article: articleLink
          ? {
              title: articleLink.sourceTitleSnapshot,
              excerpt: articleLink.sourceExcerptSnapshot,
              heroImageUrl: articleLink.sourceHeroImageUrlSnapshot,
              ctaLabel: articleLink.ctaLabel ?? 'Read Full Article',
            }
          : null,
      },
      attachments: attachments.map((a) => ({ id: a.id, filename: a.fileName })),
    };
  }

  async archive(
    adminUserId: string,
    dto: ArchiveTransmissionsDto,
  ): Promise<Record<string, unknown>> {
    await this.broadcastRepo.update(
      { id: In(dto.broadcastIds), status: NewsletterBroadcastStatus.SENT },
      { updatedByAdminId: adminUserId },
    );
    return {
      message: 'Transmissions archived successfully',
      archivedCount: dto.broadcastIds.length,
    };
  }
}
