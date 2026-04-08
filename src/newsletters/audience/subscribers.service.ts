import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, QueryFailedError, Repository } from 'typeorm';
import { NewsletterSubscriber } from './entities/newsletter-subscriber.entity';
import { ListSubscribersQueryDto } from './dto/list-subscribers-query.dto';
import { CreateSubscriberDto } from './dto/create-subscriber.dto';
import { UpdateSubscriberDto } from './dto/update-subscriber.dto';
import { NewsletterAuditService } from '../audit/newsletter-audit.service';
import { NewsletterSubscriberStatus } from 'src/common/enums/newsletter-constants.enum';
import { NewsletterDeliveryRecipient } from '../delivery/entities/newsletter-delivery-recipient.entity';
import { NewsletterSubscriberNote } from './entities/newsletter-subscriber-note.entity';
import { SubscriberHistoryQueryDto } from './dto/subscriber-history-query.dto';
import { CreateSubscriberNoteDto } from './dto/create-subscriber-note.dto';
import { UpdateSubscriberProfileDto } from './dto/update-subscriber-profile.dto';
import { ListSubscribersAdvancedQueryDto } from './dto/list-subscribers-advanced-query.dto';
import { PublicSubscribeDto } from './dto/public-subscribe.dto';

@Injectable()
export class SubscribersService {
  constructor(
    @InjectRepository(NewsletterSubscriber)
    private readonly subscriberRepo: Repository<NewsletterSubscriber>,
    @InjectRepository(NewsletterDeliveryRecipient)
    private readonly deliveryRecipientRepo: Repository<NewsletterDeliveryRecipient>,
    @InjectRepository(NewsletterSubscriberNote)
    private readonly subscriberNoteRepo: Repository<NewsletterSubscriberNote>,
    private readonly auditService: NewsletterAuditService,
  ) {}

  async publicSubscribe(
    dto: PublicSubscribeDto,
  ): Promise<Record<string, unknown>> {
    const email = dto.email.trim().toLowerCase();
    const source = dto.source?.trim().toUpperCase() || 'WEBSITE';

    let subscriber = await this.subscriberRepo.findOne({ where: { email } });

    if (subscriber) {
      let updated = false;

      if (subscriber.status !== NewsletterSubscriberStatus.ACTIVE) {
        subscriber.status = NewsletterSubscriberStatus.ACTIVE;
        subscriber.unsubscribedAt = null;
        subscriber.unsubscribeReason = null;
        subscriber.source = source;
        updated = true;
      }

      if (!subscriber.fullName && dto.fullName?.trim()) {
        subscriber.fullName = dto.fullName.trim();
        updated = true;
      }

      if (updated) {
        await this.subscriberRepo.save(subscriber);
      }
      return { message: 'Successfully subscribed to the newsletter' };
    }

    subscriber = this.subscriberRepo.create({
      email,
      fullName: dto.fullName?.trim() || null,
      status: NewsletterSubscriberStatus.ACTIVE,
      source: source,
    });

    await this.subscriberRepo.save(subscriber);
    return { message: 'Successfully subscribed to the newsletter' };
  }

  async getMetrics(): Promise<Record<string, unknown>> {
    const now = new Date();
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(now.getDate() - 7);

    // 1. Net Growth (Active Subscribers) & WoW Rate
    const currentActive = await this.subscriberRepo.count({
      where: { status: NewsletterSubscriberStatus.ACTIVE as any },
    });
    const previousActive = await this.subscriberRepo.count({
      where: {
        status: NewsletterSubscriberStatus.ACTIVE as any,
        subscribedAt: LessThan(oneWeekAgo),
      },
    });
    const growthRatePercent = previousActive
      ? ((currentActive - previousActive) / previousActive) * 100
      : 0;

    // 2. List Health (Unsubscribes) & WoW Rate
    const currentUnsub = await this.subscriberRepo.count({
      where: { status: NewsletterSubscriberStatus.UNSUBSCRIBED as any },
    });
    const previousUnsub = await this.subscriberRepo.count({
      where: {
        status: NewsletterSubscriberStatus.UNSUBSCRIBED as any,
        unsubscribedAt: LessThan(oneWeekAgo),
      },
    });
    const unsubRatePercent = previousUnsub
      ? ((currentUnsub - previousUnsub) / previousUnsub) * 100
      : 0;

    // 3. Avg Engagement
    const deliveryStats = await this.deliveryRecipientRepo
      .createQueryBuilder('dr')
      .select('COUNT(dr.id)', 'received')
      .addSelect(
        'SUM(CASE WHEN dr.firstOpenedAt IS NOT NULL THEN 1 ELSE 0 END)',
        'opened',
      )
      .getRawOne();

    const received = Number(deliveryStats?.received || 0);
    const opened = Number(deliveryStats?.opened || 0);
    const avgEngagementPercent = received ? (opened / received) * 100 : 0;

    // 4. Top Sources Rate
    const totalSubs = await this.subscriberRepo.count();
    const topSourcesRaw = await this.subscriberRepo
      .createQueryBuilder('s')
      .select('s.source', 'source')
      .addSelect('COUNT(*)', 'count')
      .where('s.source IS NOT NULL')
      .groupBy('s.source')
      .orderBy('COUNT(*)', 'DESC')
      .limit(5)
      .getRawMany<{ source: string; count: string }>();

    const topSources = topSourcesRaw.map((r) => ({
      source: r.source,
      count: Number(r.count),
      ratePercent: totalSubs
        ? Number(((Number(r.count) / totalSubs) * 100).toFixed(1))
        : 0,
    }));

    return {
      netGrowth: {
        totalActive: currentActive,
        growthRatePercent: Number(growthRatePercent.toFixed(1)),
      },
      avgEngagement: {
        percent: Number(avgEngagementPercent.toFixed(1)),
      },
      listHealth: {
        unsubscribedCount: currentUnsub,
        unsubscribeRatePercent: Number(unsubRatePercent.toFixed(1)),
      },
      topSources,
    };
  }

  async list(
    query: ListSubscribersAdvancedQueryDto,
  ): Promise<Record<string, unknown>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.subscriberRepo.createQueryBuilder('s');

    if (query.search?.trim()) {
      const q = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere(
        "(LOWER(s.email) LIKE :q OR LOWER(COALESCE(s.fullName, '')) LIKE :q OR LOWER(COALESCE(s.clinicalRole, '')) LIKE :q)",
        { q },
      );
    }

    if (query.statuses?.length) {
      qb.andWhere('s.status IN (:...statuses)', { statuses: query.statuses });
    } else if ((query as any).status) {
      // Fallback for single status filter
      qb.andWhere('s.status = :status', { status: (query as any).status });
    }

    if (query.acquisitionSources?.length) {
      qb.andWhere('s.source IN (:...sources)', {
        sources: query.acquisitionSources,
      });
    }

    if (query.role?.trim()) {
      qb.andWhere("LOWER(COALESCE(s.clinicalRole, '')) = :role", {
        role: query.role.trim().toLowerCase(),
      });
    }

    if (query.joinedFromDate) {
      qb.andWhere('s.subscribedAt >= :joinedFromDate', {
        joinedFromDate: new Date(query.joinedFromDate),
      });
    }

    if (query.joinedToDate) {
      qb.andWhere('s.subscribedAt <= :joinedToDate', {
        joinedToDate: new Date(query.joinedToDate),
      });
    }

    const sortBy = query.sortBy ?? 'joinedDate';
    const sortOrder = query.sortOrder ?? 'DESC';

    if (sortBy === 'fullName') qb.orderBy('s.fullName', sortOrder);
    else qb.orderBy('s.subscribedAt', sortOrder);

    qb.skip((page - 1) * limit).take(limit);

    const [subs, total] = await qb.getManyAndCount();
    const subIds = subs.map((s) => s.id);

    // Engagement Rollup
    const metricsRows = subIds.length
      ? await this.deliveryRecipientRepo
          .createQueryBuilder('dr')
          .select('dr.subscriberId', 'subscriberId')
          .addSelect('COUNT(dr.id)', 'received')
          .addSelect(
            'SUM(CASE WHEN dr.firstOpenedAt IS NOT NULL THEN 1 ELSE 0 END)',
            'opened',
          )
          .where('dr.subscriberId IN (:...subIds)', { subIds })
          .groupBy('dr.subscriberId')
          .getRawMany<{
            subscriberId: string;
            received: string;
            opened: string;
          }>()
      : [];

    const metricMap = new Map(
      metricsRows.map((r) => [
        r.subscriberId,
        { received: Number(r.received), opened: Number(r.opened) },
      ]),
    );

    let rows = subs.map((s: any) => {
      const m = metricMap.get(s.id) ?? { received: 0, opened: 0 };
      const engagementRate = m.received
        ? Number(((m.opened / m.received) * 100).toFixed(0))
        : 0;

      return {
        id: s.id,
        subscriberIdentity: {
          fullName: s.fullName,
          email: s.email,
          avatarInitials: (s.fullName || s.email || '')
            .split(/\s+/)
            .slice(0, 2)
            .map((p: string) => p[0] || '')
            .join('')
            .toUpperCase(),
          image: null, // Ready for profile picture URLs if added later
        },
        clinicalRole: s.clinicalRole ?? null,
        source: s.source ?? null,
        received: m.received,
        opened: m.opened,
        engagementRatePercent: engagementRate,
        joinedDate: s.subscribedAt,
        status: s.status,
      };
    });

    // Apply Post-Fetch Filters
    if (query.minMessagesReceived !== undefined) {
      rows = rows.filter((r) => r.received >= query.minMessagesReceived!);
    }
    if (query.minOpenRatePercent !== undefined) {
      rows = rows.filter(
        (r) => r.engagementRatePercent >= query.minOpenRatePercent!,
      );
    }

    // Apply Post-Fetch Sorting for Metrics
    if (sortBy === 'engagementRate')
      rows.sort((a, b) =>
        sortOrder === 'ASC'
          ? a.engagementRatePercent - b.engagementRatePercent
          : b.engagementRatePercent - a.engagementRatePercent,
      );
    if (sortBy === 'received')
      rows.sort((a, b) =>
        sortOrder === 'ASC' ? a.received - b.received : b.received - a.received,
      );
    if (sortBy === 'opened')
      rows.sort((a, b) =>
        sortOrder === 'ASC' ? a.opened - b.opened : b.opened - a.opened,
      );

    return {
      items: rows,
      meta: { page, limit, total },
    };
  }

  async update(
    adminUserId: string,
    id: string,
    dto: UpdateSubscriberDto,
  ): Promise<Record<string, unknown>> {
    const subscriber = await this.subscriberRepo.findOne({ where: { id } });
    if (!subscriber) throw new NotFoundException('Subscriber not found');

    if (dto.fullName !== undefined)
      subscriber.fullName = dto.fullName?.trim() || null;

    if (dto.status !== undefined) {
      subscriber.status = dto.status;

      if (dto.status === NewsletterSubscriberStatus.UNSUBSCRIBED) {
        subscriber.unsubscribedAt = new Date();
        subscriber.unsubscribeReason =
          dto.unsubscribeReason?.trim() || subscriber.unsubscribeReason || null;
      }

      if (dto.status === NewsletterSubscriberStatus.ACTIVE) {
        subscriber.unsubscribedAt = null;
        subscriber.unsubscribeReason = null;
      }
    }

    if (dto.unsubscribeReason !== undefined && dto.status === undefined) {
      subscriber.unsubscribeReason = dto.unsubscribeReason?.trim() || null;
    }

    subscriber.updatedByAdminId = adminUserId;

    const saved = await this.subscriberRepo.save(subscriber);

    await this.auditService.log({
      entityType: 'SUBSCRIBER',
      entityId: saved.id,
      action: 'UPDATE',
      performedByAdminId: adminUserId,
    });

    return {
      message: 'Subscriber updated successfully',
      id: saved.id,
      email: saved.email,
      status: saved.status,
    };
  }

  async getFilterOptions(): Promise<Record<string, unknown>> {
    const sourceRows = await this.subscriberRepo
      .createQueryBuilder('s')
      .select('DISTINCT s.source', 'source')
      .where('s.source IS NOT NULL')
      // Removed MANUAL safely at the DB level, just in case legacy data exists
      .andWhere("s.source != 'MANUAL'")
      .orderBy('s.source', 'ASC')
      .getRawMany<{ source: string }>();

    const roleRows = await this.subscriberRepo
      .createQueryBuilder('s')
      .select('DISTINCT s.clinicalRole', 'clinicalRole')
      .where('s.clinicalRole IS NOT NULL')
      .orderBy('s.clinicalRole', 'ASC')
      .getRawMany<{ clinicalRole: string }>()
      .catch(() => []);

    return {
      statuses: Object.values(NewsletterSubscriberStatus),
      acquisitionSources: sourceRows.map((r) => r.source),
      roles: roleRows.map((r) => r.clinicalRole).filter(Boolean),
      quickDateRanges: ['LAST_7_DAYS', 'LAST_30_DAYS', 'CUSTOM'],
    };
  }

  async getProfile(subscriberId: string): Promise<Record<string, unknown>> {
    const subscriber = await this.subscriberRepo.findOne({
      where: { id: subscriberId } as any,
    });
    if (!subscriber) throw new NotFoundException('Subscriber not found');

    const notes = await this.subscriberNoteRepo.find({
      where: { subscriberId },
      order: { createdAt: 'DESC' },
      take: 10,
    });

    const recipientRows = await this.deliveryRecipientRepo.find({
      where: { subscriberId } as any,
      select: [
        'id',
        'deliveryStatus',
        'sentAt',
        'firstOpenedAt',
        'firstClickedAt',
        'broadcastId',
      ],
      order: { createdAt: 'DESC' } as any,
      take: 200,
    });

    const receivedCount = recipientRows.length;
    const openedCount = recipientRows.filter((r) => !!r.firstOpenedAt).length;
    const engagementRatePercent = receivedCount
      ? Math.round((openedCount / receivedCount) * 100)
      : 0;

    return {
      profile: {
        id: subscriber.id,
        fullName: subscriber.fullName,
        email: subscriber.email,
        phone: (subscriber as any).phone ?? null,
        status: subscriber.status,
        clinicalRole: (subscriber as any).clinicalRole ?? null,
        institution: (subscriber as any).institution ?? null,
        acquisitionSource: subscriber.source ?? null,
        joinedDate: subscriber.subscribedAt,
      },
      cards: {
        engagementRatePercent,
        totalReceived: receivedCount,
        courseAttendanceCount: 0,
        lifetimeValue: 0,
      },
      adminNotes: notes.map((n) => ({
        id: n.id,
        note: n.note,
        createdAt: n.createdAt,
        createdByAdminId: n.createdByAdminId,
      })),
      // tabs: {
      //   orders: {
      //     endpoint: `/admin/newsletters/general/subscribers/${subscriberId}/order-history`,
      //   },
      //   newsletters: {
      //     endpoint: `/admin/newsletters/general/subscribers/${subscriberId}/newsletter-history`,
      //   },
      // },
    };
  }

  async updateProfile(
    adminUserId: string,
    subscriberId: string,
    dto: UpdateSubscriberProfileDto,
  ): Promise<Record<string, unknown>> {
    const s: any = await this.subscriberRepo.findOne({
      where: { id: subscriberId } as any,
    });
    if (!s) throw new NotFoundException('Subscriber not found');

    if (dto.fullName !== undefined) s.fullName = dto.fullName?.trim() || null;
    if (dto.phone !== undefined) s.phone = dto.phone?.trim() || null;
    if (dto.clinicalRole !== undefined)
      s.clinicalRole = dto.clinicalRole?.trim() || null;
    if (dto.institution !== undefined)
      s.institution = dto.institution?.trim() || null;
    if (dto.acquisitionSource !== undefined)
      s.source = dto.acquisitionSource?.trim() || s.source;

    s.updatedByAdminId = adminUserId;
    const saved = await this.subscriberRepo.save(s);

    await this.auditService.log({
      entityType: 'SUBSCRIBER',
      entityId: saved.id,
      action: 'UPDATE_PROFILE',
      performedByAdminId: adminUserId,
    });

    return {
      message: 'Subscriber profile updated successfully',
      id: saved.id,
      identifier: saved.email,
    };
  }

  async addNote(
    adminUserId: string,
    subscriberId: string,
    dto: CreateSubscriberNoteDto,
  ): Promise<Record<string, unknown>> {
    const subscriber = await this.subscriberRepo.findOne({
      where: { id: subscriberId } as any,
    });
    if (!subscriber) throw new NotFoundException('Subscriber not found');

    const note = await this.subscriberNoteRepo.save(
      this.subscriberNoteRepo.create({
        subscriberId,
        note: dto.note.trim(),
        createdByAdminId: adminUserId,
      }),
    );

    await this.auditService.log({
      entityType: 'SUBSCRIBER',
      entityId: subscriberId,
      action: 'ADD_NOTE',
      performedByAdminId: adminUserId,
      meta: { noteId: note.id },
    });

    return {
      message: 'Subscriber note added successfully',
      id: note.id,
      identifier: subscriber.email,
    };
  }

  async getNewsletterHistory(
    subscriberId: string,
    query: SubscriberHistoryQueryDto,
  ): Promise<Record<string, unknown>> {
    const subscriber = await this.subscriberRepo.findOne({
      where: { id: subscriberId } as any,
    });
    if (!subscriber) throw new NotFoundException('Subscriber not found');

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const [rows, total] = await this.deliveryRecipientRepo.findAndCount({
      where: { subscriberId } as any,
      order: { createdAt: 'DESC' } as any,
      skip: (page - 1) * limit,
      take: limit,
    });

    const broadcastIds = [...new Set(rows.map((r) => r.broadcastId))];
    const broadcasts = broadcastIds.length
      ? await (this as any).broadcastRepo.findBy({ id: In(broadcastIds) })
      : [];
    const broadcastMap = new Map(broadcasts.map((b: any) => [b.id, b]));

    return {
      items: rows.map((r) => {
        const b: any = broadcastMap.get(r.broadcastId);
        return {
          deliveryRecipientId: r.id,
          newsletterTitle: b?.subjectLine ?? 'Newsletter',
          sentDate: r.sentAt ?? b?.sentAt ?? null,
          status: r.deliveryStatus,
          openActivity: !!r.firstOpenedAt,
          clickActivity: !!r.firstClickedAt,
          actions: { view: true },
        };
      }),
      meta: { page, limit, total },
    };
  }

  async getOrderHistory(
    subscriberId: string,
    query: SubscriberHistoryQueryDto,
  ): Promise<Record<string, unknown>> {
    const subscriber = await this.subscriberRepo.findOne({
      where: { id: subscriberId } as any,
    });
    if (!subscriber) throw new NotFoundException('Subscriber not found');

    return {
      items: [],
      meta: { page: query.page ?? 1, limit: query.limit ?? 10, total: 0 },
      integrationStatus: 'PENDING_ORDER_MODULE_ADAPTER',
    };
  }
}
