import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, Repository } from 'typeorm';
import { NewsletterBroadcast } from '../broadcasts/entities/newsletter-broadcast.entity';
import { NewsletterSubscriber } from '../audience/entities/newsletter-subscriber.entity';
import { NewsletterUnsubscribeRequest } from '../unsubscribe/entities/newsletter-unsubscribe-request.entity';
import { GetRecentTransmissionsQueryDto } from './dto/get-recent-transmissions-query.dto';
import {
  NewsletterBroadcastStatus,
  NewsletterChannelType,
  NewsletterSubscriberStatus,
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
    const now = new Date();
    const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalSent,
      currentActiveSubs,
      prevActiveSubs,
      pendingUnsubRequests,
      courseAnnouncementsCount,
      queuedSummary,
    ] = await Promise.all([
      this.broadcastRepo.count({
        where: {
          channelType: NewsletterChannelType.GENERAL,
          status: NewsletterBroadcastStatus.SENT,
        },
      }),
      this.subscriberRepo.count({
        where: { status: NewsletterSubscriberStatus.ACTIVE },
      }),
      this.subscriberRepo.count({
        where: {
          status: NewsletterSubscriberStatus.ACTIVE,
          createdAt: LessThan(lastWeek),
        },
      }),
      this.unsubscribeRequestRepo.count({
        where: { status: NewsletterUnsubscribeRequestStatus.PENDING },
      }),
      this.broadcastRepo.count({
        where: { channelType: NewsletterChannelType.COURSE_ANNOUNCEMENT },
      }),
      this.getQueuedSummary(),
    ]);

    const growthRate =
      prevActiveSubs > 0
        ? Number(
            (
              ((currentActiveSubs - prevActiveSubs) / prevActiveSubs) *
              100
            ).toFixed(1),
          )
        : 0;

    return {
      metrics: {
        totalSent,
        audienceReach: {
          total: currentActiveSubs,
          growthRatePercent: growthRate,
          isPositive: growthRate >= 0,
        },
        courseUpdates: courseAnnouncementsCount,
        unsubscriptionRequests: {
          count: pendingUnsubRequests,
          statusLabel: 'Pending action',
        },
      },
      queueSummary: queuedSummary,
    };
  }

  async getRecentTransmissions(
    query: GetRecentTransmissionsQueryDto,
  ): Promise<Record<string, unknown>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const qb = this.broadcastRepo
      .createQueryBuilder('b')
      // Remove the channelType filter to show both General and Course updates
      .where('b.status IN (:...statuses)', {
        statuses: [
          NewsletterBroadcastStatus.SENT,
          NewsletterBroadcastStatus.CANCELLED,
          NewsletterBroadcastStatus.FAILED,
        ],
      });
    // .andWhere('b.status IN (:...statuses)', {
    //   statuses: [
    //     NewsletterBroadcastStatus.SENT,
    //     NewsletterBroadcastStatus.CANCELLED,
    //     NewsletterBroadcastStatus.FAILED,
    //   ],
    // });

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
        audienceLabel: 'All Subscribers',
        openRatePercent: Number(b.openRatePercent || 0),
        sentAt: b.sentAt,
      })),
      meta: { page, limit, total },
    };
  }

  private async getQueuedSummary() {
    const queued = await this.broadcastRepo.find({
      where: {
        channelType: NewsletterChannelType.GENERAL,
        status: In([
          NewsletterBroadcastStatus.READY,
          NewsletterBroadcastStatus.SCHEDULED,
        ]),
      },
      select: ['frequencyType'],
    });

    return {
      queuedCount: queued.length,
      weeklyQueuedCount: queued.filter((b) => b.frequencyType === 'WEEKLY')
        .length,
      monthlyQueuedCount: queued.filter((b) => b.frequencyType === 'MONTHLY')
        .length,
    };
  }
}
