import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { NewsletterBroadcast } from '../broadcasts/entities/newsletter-broadcast.entity';
import { NewsletterSubscriber } from '../audience/entities/newsletter-subscriber.entity';
import { NewsletterUnsubscribeRequest } from '../unsubscribe/entities/newsletter-unsubscribe-request.entity';
import { GetRecentTransmissionsQueryDto } from './dto/get-recent-transmissions-query.dto';
import {
  NewsletterBroadcastStatus,
  NewsletterChannelType,
  NewsletterUnsubscribeRequestStatus,
} from 'src/common/enums/newsletter-constants.enum';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(NewsletterBroadcast)
    private readonly broadcastRepo: Repository<NewsletterBroadcast>,
    @InjectRepository(NewsletterSubscriber)
    private readonly subscriberRepo: Repository<NewsletterSubscriber>,
    @InjectRepository(NewsletterUnsubscribeRequest)
    private readonly unsubscribeRequestRepo: Repository<NewsletterUnsubscribeRequest>,
  ) {}

  async getDashboard(): Promise<Record<string, unknown>> {
    const [
      totalSent,
      generalBlasts,
      totalSubscribers,
      pendingUnsubscribeRequests,
      queuedCount,
      weeklyQueuedCount,
      monthlyQueuedCount,
      sentRows,
    ] = await Promise.all([
      this.broadcastRepo.count({
        where: {
          channelType: NewsletterChannelType.GENERAL,
          status: NewsletterBroadcastStatus.SENT,
        },
      }),
      this.broadcastRepo.count({
        where: {
          channelType: NewsletterChannelType.GENERAL,
          status: In([
            NewsletterBroadcastStatus.SENT,
            NewsletterBroadcastStatus.SCHEDULED,
          ]),
        },
      }),
      this.subscriberRepo.count(),
      this.unsubscribeRequestRepo.count({
        where: { status: NewsletterUnsubscribeRequestStatus.PENDING },
      }),
      this.broadcastRepo.count({
        where: {
          channelType: NewsletterChannelType.GENERAL,
          status: In([
            NewsletterBroadcastStatus.READY,
            NewsletterBroadcastStatus.SCHEDULED,
          ]),
        },
      }),
      this.broadcastRepo.count({
        where: {
          channelType: NewsletterChannelType.GENERAL,
          status: In([
            NewsletterBroadcastStatus.READY,
            NewsletterBroadcastStatus.SCHEDULED,
          ]),
          frequencyType: 'WEEKLY' as any,
        },
      }),
      this.broadcastRepo.count({
        where: {
          channelType: NewsletterChannelType.GENERAL,
          status: In([
            NewsletterBroadcastStatus.READY,
            NewsletterBroadcastStatus.SCHEDULED,
          ]),
          frequencyType: 'MONTHLY' as any,
        },
      }),
      this.broadcastRepo.find({
        where: {
          channelType: NewsletterChannelType.GENERAL,
          status: NewsletterBroadcastStatus.SENT,
        },
        select: ['openRatePercent'],
        take: 20,
        order: { sentAt: 'DESC' },
      }),
    ]);

    const avgOpenRate =
      sentRows.length > 0
        ? Number(
            (
              sentRows.reduce(
                (sum, r) => sum + Number(r.openRatePercent || 0),
                0,
              ) / sentRows.length
            ).toFixed(2),
          )
        : 0;

    return {
      metrics: {
        totalSent,
        generalBlasts,
        openRatePercent: avgOpenRate,
        totalSubscribers,
        pendingUnsubscribeRequests,
      },
      queueSummary: {
        queuedCount,
        weeklyQueuedCount,
        monthlyQueuedCount,
        nextCoverageDays: queuedCount * 7, // MVP placeholder
      },
    };
  }

  async getRecentTransmissions(
    query: GetRecentTransmissionsQueryDto,
  ): Promise<Record<string, unknown>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const qb = this.broadcastRepo
      .createQueryBuilder('b')
      .where('b.channelType = :channelType', {
        channelType: NewsletterChannelType.GENERAL,
      })
      .andWhere('b.status IN (:...statuses)', {
        statuses: [
          NewsletterBroadcastStatus.SENT,
          NewsletterBroadcastStatus.CANCELLED,
          NewsletterBroadcastStatus.FAILED,
        ],
      });

    if (query.status) {
      qb.andWhere('b.status = :status', { status: query.status });
    }

    qb.orderBy('COALESCE(b.sentAt, b.updatedAt)', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [rows, total] = await qb.getManyAndCount();

    return {
      items: rows.map((b) => ({
        id: b.id,
        status: b.status,
        contentType: b.contentType,
        subjectLine: b.subjectLine,
        audienceLabel: 'General Subscribers',
        openRatePercent: Number(b.openRatePercent || 0),
        sentAt: b.sentAt,
      })),
      meta: { page, limit, total },
    };
  }
}
