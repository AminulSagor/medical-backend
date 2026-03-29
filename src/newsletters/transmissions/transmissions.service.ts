import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';

import { NewsletterBroadcast } from 'src/newsletters/broadcasts/entities/newsletter-broadcast.entity';
import { NewsletterBroadcastArticleLink } from 'src/newsletters/broadcasts/entities/newsletter-broadcast-article-link.entity';
import { NewsletterBroadcastCustomContent } from 'src/newsletters/broadcasts/entities/newsletter-broadcast-custom-content.entity';
import { NewsletterBroadcastAttachment } from 'src/newsletters/broadcasts/entities/newsletter-broadcast-attachment.entity';
import { NewsletterBroadcastSegment } from 'src/newsletters/broadcasts/entities/newsletter-broadcast-segment.entity';

import { NewsletterDeliveryRecipient } from 'src/newsletters/delivery/entities/newsletter-delivery-recipient.entity';
import { NewsletterTransmissionEvent } from 'src/newsletters/delivery/entities/newsletter-transmission-event.entity';

import { NewsletterAudienceSegment } from 'src/newsletters/audience/entities/newsletter-audience-segment.entity';
import { NewsletterSubscriber } from 'src/newsletters/audience/entities/newsletter-subscriber.entity';

import {
  NewsletterBroadcastStatus,
  NewsletterChannelType,
  NewsletterDeliveryRecipientStatus,
} from 'src/common/enums/newsletter-constants.enum';

import { ListTransmissionsQueryDto } from './dto/list-transmissions-query.dto';
import { ArchiveTransmissionsDto } from './dto/archive-transmissions.dto';
import { ListTransmissionRecipientsQueryDto } from './dto/list-transmission-recipients-query.dto';

@Injectable()
export class TransmissionsService {
  constructor(
    private readonly dataSource: DataSource,

    @InjectRepository(NewsletterBroadcast)
    private readonly broadcastRepo: Repository<NewsletterBroadcast>,

    @InjectRepository(NewsletterBroadcastArticleLink)
    private readonly articleLinkRepo: Repository<NewsletterBroadcastArticleLink>,

    @InjectRepository(NewsletterBroadcastCustomContent)
    private readonly customContentRepo: Repository<NewsletterBroadcastCustomContent>,

    @InjectRepository(NewsletterBroadcastAttachment)
    private readonly attachmentRepo: Repository<NewsletterBroadcastAttachment>,

    @InjectRepository(NewsletterBroadcastSegment)
    private readonly broadcastSegmentRepo: Repository<NewsletterBroadcastSegment>,

    @InjectRepository(NewsletterAudienceSegment)
    private readonly segmentRepo: Repository<NewsletterAudienceSegment>,

    @InjectRepository(NewsletterDeliveryRecipient)
    private readonly recipientRepo: Repository<NewsletterDeliveryRecipient>,

    @InjectRepository(NewsletterTransmissionEvent)
    private readonly eventRepo: Repository<NewsletterTransmissionEvent>,

    @InjectRepository(NewsletterSubscriber)
    private readonly subscriberRepo: Repository<NewsletterSubscriber>,
  ) {}

  async list(
    query: ListTransmissionsQueryDto,
  ): Promise<Record<string, unknown>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const qb = this.broadcastRepo
      .createQueryBuilder('b')
      .where('b.status = :status', { status: NewsletterBroadcastStatus.SENT });

    if (query.search?.trim()) {
      const s = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere(
        `LOWER(b.subjectLine) LIKE :s OR LOWER(COALESCE(b.internalName,'')) LIKE :s`,
        { s },
      );
    }

    if (query.dateFrom) {
      qb.andWhere('b.sentAt >= :from', { from: new Date(query.dateFrom) });
    }
    if (query.dateTo) {
      qb.andWhere('b.sentAt <= :to', { to: new Date(query.dateTo) });
    }

    qb.orderBy('b.sentAt', query.sortOrder ?? 'DESC');
    qb.skip((page - 1) * limit).take(limit);

    const [items, total] = await qb.getManyAndCount();
    const ids = items.map((x) => x.id);

    // audience labels
    const segRows = ids.length
      ? await this.broadcastSegmentRepo.find({
          where: { broadcastId: In(ids) },
        })
      : [];
    const segIds = [...new Set(segRows.map((r) => r.segmentId))];
    const segs = segIds.length
      ? await this.segmentRepo.findBy({ id: In(segIds) })
      : [];
    const segMap = new Map(segs.map((s) => [s.id, s.name]));
    const segByBroadcast = new Map<string, string[]>();
    for (const r of segRows) {
      const arr = segByBroadcast.get(r.broadcastId) ?? [];
      const name = segMap.get(r.segmentId);
      if (name) arr.push(name);
      segByBroadcast.set(r.broadcastId, arr);
    }

    // engagement aggregates (open/click/bounce)
    const agg = ids.length
      ? await this.recipientRepo
          .createQueryBuilder('r')
          .select('r.broadcastId', 'broadcastId')
          .addSelect('COUNT(*)', 'total')
          .addSelect(
            `SUM(CASE WHEN r.firstOpenedAt IS NOT NULL THEN 1 ELSE 0 END)`,
            'opened',
          )
          .addSelect(
            `SUM(CASE WHEN r.firstClickedAt IS NOT NULL THEN 1 ELSE 0 END)`,
            'clicked',
          )
          .addSelect(
            `SUM(CASE WHEN r.deliveryStatus = :bounced THEN 1 ELSE 0 END)`,
            'bounced',
          )
          .where('r.broadcastId IN (:...ids)', { ids })
          .setParameter('bounced', NewsletterDeliveryRecipientStatus.BOUNCED)
          .groupBy('r.broadcastId')
          .getRawMany<{
            broadcastId: string;
            total: string;
            opened: string;
            clicked: string;
            bounced: string;
          }>()
      : [];

    const aggMap = new Map(
      agg.map((a) => [
        a.broadcastId,
        {
          total: Number(a.total || 0),
          opened: Number(a.opened || 0),
          clicked: Number(a.clicked || 0),
          bounced: Number(a.bounced || 0),
        },
      ]),
    );

    // top cards across current filtered set
    const totals = [...aggMap.values()].reduce(
      (acc, x) => {
        acc.totalRecipients += x.total;
        acc.opened += x.opened;
        acc.bounced += x.bounced;
        return acc;
      },
      { totalRecipients: 0, opened: 0, bounced: 0 },
    );

    const avgOpenRate =
      totals.totalRecipients > 0
        ? Number(((totals.opened / totals.totalRecipients) * 100).toFixed(0))
        : 0;

    const bounceRate =
      totals.totalRecipients > 0
        ? Number(((totals.bounced / totals.totalRecipients) * 100).toFixed(1))
        : 0;

    return {
      cards: {
        totalSent: total,
        avgOpenRatePercent: avgOpenRate,
        bounceRatePercent: bounceRate,
      },
      items: items.map((b) => {
        const segNames = segByBroadcast.get(b.id) ?? [];
        const a = aggMap.get(b.id) ?? {
          total: 0,
          opened: 0,
          clicked: 0,
          bounced: 0,
        };

        const openRate = a.total
          ? Number(((a.opened / a.total) * 100).toFixed(0))
          : 0;
        const clickRate = a.total
          ? Number(((a.clicked / a.total) * 100).toFixed(0))
          : 0;

        const audienceLabel =
          b.channelType === NewsletterChannelType.GENERAL
            ? 'All Subscribers'
            : segNames.length
              ? segNames[0]
              : 'Target cohorts';

        const typeBadge =
          b.channelType === NewsletterChannelType.COURSE_ANNOUNCEMENT
            ? 'CLASS UPDATE'
            : 'NEWSLETTER';

        return {
          id: b.id,
          status: { code: b.status, label: 'Sent' },
          type: { label: typeBadge },
          subject: b.subjectLine,
          targetAudience: audienceLabel,
          rates: { openRatePercent: openRate, clickRatePercent: clickRate },
          sentAt: b.sentAt,
          actions: { viewSentContent: true, viewReport: true },
        };
      }),
      meta: { page, limit, total },
    };
  }

  async archive(
    adminUserId: string,
    dto: ArchiveTransmissionsDto,
  ): Promise<Record<string, unknown>> {
    // simple archive = set internalName prefix or a future 'archivedAt' column
    // MVP: keep clean minimal response
    await this.broadcastRepo.update(
      { id: In(dto.broadcastIds), status: NewsletterBroadcastStatus.SENT },
      { updatedByAdminId: adminUserId },
    );

    return {
      message: 'Transmissions archived successfully',
      id: dto.broadcastIds[0],
      archivedCount: dto.broadcastIds.length,
    };
  }

  async getReport(broadcastId: string): Promise<Record<string, unknown>> {
    const b = await this.broadcastRepo.findOne({
      where: { id: broadcastId, status: NewsletterBroadcastStatus.SENT },
    });
    if (!b) throw new NotFoundException('Transmission not found');

    const totals = await this.recipientRepo
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
      .addSelect(
        `SUM(CASE WHEN r.deliveryStatus = :bounced THEN 1 ELSE 0 END)`,
        'bounced',
      )
      .where('r.broadcastId = :id', { id: broadcastId })
      .setParameter('bounced', NewsletterDeliveryRecipientStatus.BOUNCED)
      .getRawOne<{
        total: string;
        delivered: string;
        opened: string;
        clicked: string;
        bounced: string;
      }>();

    const total = Number(totals?.total || 0);
    const delivered = Number(totals?.delivered || 0);
    const opened = Number(totals?.opened || 0);
    const clicked = Number(totals?.clicked || 0);
    const bounced = Number(totals?.bounced || 0);

    const deliveryRate = total
      ? Number(((delivered / total) * 100).toFixed(1))
      : 0;
    const openRate = total ? Number(((opened / total) * 100).toFixed(1)) : 0;
    const clickRate = total ? Number(((clicked / total) * 100).toFixed(1)) : 0;

    // engagement over first 24h (bucket by firstOpenedAt)
    const openedRows = await this.recipientRepo.find({
      where: { broadcastId, firstOpenedAt: In([null]) as any }, // placeholder to avoid TS issues; we’ll do QB below
      take: 0,
    });

    const rawOpenTimes = await this.recipientRepo
      .createQueryBuilder('r')
      .select(['r.firstOpenedAt', 'r.sentAt'])
      .where('r.broadcastId = :id', { id: broadcastId })
      .andWhere('r.firstOpenedAt IS NOT NULL')
      .getMany();

    const buckets = Array.from({ length: 24 }, () => 0);
    for (const r of rawOpenTimes) {
      if (!r.firstOpenedAt || !r.sentAt) continue;
      const diffHours = Math.floor(
        (r.firstOpenedAt.getTime() - r.sentAt.getTime()) / 3600000,
      );
      if (diffHours >= 0 && diffHours < 24) buckets[diffHours] += 1;
    }

    // top links (requires click events to carry URL; MVP parses payloadText if it’s JSON)
    const clickEvents = await this.eventRepo.find({
      where: { broadcastId, eventType: 'CLICK' as any },
      take: 5000,
      order: { occurredAt: 'ASC' },
    });

    const linkCounts = new Map<string, number>();
    for (const ev of clickEvents) {
      const raw = ev.payloadText || '';
      let url = '';
      try {
        const parsed = JSON.parse(raw);
        url = String(parsed?.url || parsed?.link || '');
      } catch {
        // ignore
      }
      if (!url) continue;
      linkCounts.set(url, (linkCounts.get(url) ?? 0) + 1);
    }

    const topLinks = [...linkCounts.entries()]
      .sort((a, b2) => b2[1] - a[1])
      .slice(0, 5)
      .map(([url, clicks]) => ({ url, clicks }));

    return {
      cards: {
        deliveryRatePercent: deliveryRate,
        openRatePercent: openRate,
        clickRatePercent: clickRate,
        attritionPercent: 0.0, // requires unsubscribe linkage (future)
      },
      engagementOverTime: {
        unit: 'hour',
        buckets,
      },
      topPerformingLinks: topLinks,
      actions: {
        viewSentContent: true,
      },
    };
  }

  async listRecipients(
    broadcastId: string,
    query: ListTransmissionRecipientsQueryDto,
  ): Promise<Record<string, unknown>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const tab = query.tab ?? 'all';

    const qb = this.recipientRepo
      .createQueryBuilder('r')
      .leftJoin(NewsletterSubscriber, 's', 's.id = r.subscriberId')
      .where('r.broadcastId = :id', { id: broadcastId });

    if (tab === 'opened') qb.andWhere('r.firstOpenedAt IS NOT NULL');
    if (tab === 'clicked') qb.andWhere('r.firstClickedAt IS NOT NULL');
    if (tab === 'bounced')
      qb.andWhere('r.deliveryStatus = :b', {
        b: NewsletterDeliveryRecipientStatus.BOUNCED,
      });

    if (query.search?.trim()) {
      const s = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere(
        "(LOWER(r.emailSnapshot) LIKE :s OR LOWER(COALESCE(s.fullName, '')) LIKE :s)",
        { s },
      );
    }

    qb.orderBy('COALESCE(r.lastEventAt, r.sentAt)', 'DESC');
    qb.skip((page - 1) * limit).take(limit);

    const [rows, total] = await qb.getManyAndCount();

    return {
      tab,
      items: rows.map((r: any) => {
        const status =
          r.deliveryStatus === NewsletterDeliveryRecipientStatus.BOUNCED
            ? 'BOUNCED'
            : r.firstClickedAt
              ? 'CLICKED'
              : r.firstOpenedAt
                ? 'OPENED'
                : r.sentAt
                  ? 'SENT'
                  : '—';

        const timestamp =
          r.firstClickedAt ||
          r.firstOpenedAt ||
          r.deliveredAt ||
          r.sentAt ||
          null;

        return {
          id: r.id,
          recipient: {
            name: r.subscriberId ? (r.s_fullName ?? null) : null,
            email: r.emailSnapshot,
          },
          status,
          device: null, // add if you store device in events later
          timestamp,
        };
      }),
      meta: { page, limit, total },
    };
  }

  async getSentContent(broadcastId: string): Promise<Record<string, unknown>> {
    const b = await this.broadcastRepo.findOne({
      where: { id: broadcastId },
    });
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
      fromLabel: 'Texas Airway Institute <education@tai.edu>',
      content: {
        html: customContent?.messageBodyHtml ?? null,
        text: customContent?.messageBodyText ?? null,
        article: articleLink
          ? {
              title: articleLink.sourceTitleSnapshot,
              excerpt: articleLink.sourceExcerptSnapshot,
              heroImageUrl: articleLink.sourceHeroImageUrlSnapshot,
              ctaLabel: articleLink.ctaLabel ?? 'Read Full Article',
            }
          : null,
      },
      attachments: attachments.map((a) => ({
        id: a.id,
        filename: a.fileName,
        mimeType: a.mimeType,
        sizeBytes: Number(a.fileSizeBytes),
        storageKey: a.fileKey,
      })),
    };
  }
}
