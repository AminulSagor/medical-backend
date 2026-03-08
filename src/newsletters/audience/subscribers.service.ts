import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, QueryFailedError, Repository } from 'typeorm';
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

  async list(query: ListSubscribersQueryDto): Promise<Record<string, unknown>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const qb = this.subscriberRepo.createQueryBuilder('s');

    if (query.status) {
      qb.andWhere('s.status = :status', { status: query.status });
    }

    if (query.search?.trim()) {
      const q = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere(
        "(LOWER(s.email) LIKE :q OR LOWER(COALESCE(s.fullName, '')) LIKE :q)",
        { q },
      );
    }

    qb.orderBy('s.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [rows, total] = await qb.getManyAndCount();

    return {
      items: rows.map((r) => ({
        id: r.id,
        email: r.email,
        fullName: r.fullName,
        status: r.status,
        source: r.source,
        subscribedAt: r.subscribedAt,
        unsubscribedAt: r.unsubscribedAt,
      })),
      meta: { page, limit, total },
    };
  }

  async create(
    adminUserId: string,
    dto: CreateSubscriberDto,
  ): Promise<Record<string, unknown>> {
    const email = dto.email.trim().toLowerCase();

    const subscriber = this.subscriberRepo.create({
      email,
      fullName: dto.fullName?.trim() || null,
      status: NewsletterSubscriberStatus.ACTIVE,
      source: 'MANUAL',
      createdByAdminId: adminUserId,
      updatedByAdminId: adminUserId,
    });

    try {
      const saved = await this.subscriberRepo.save(subscriber);

      await this.auditService.log({
        entityType: 'SUBSCRIBER',
        entityId: saved.id,
        action: 'CREATE',
        performedByAdminId: adminUserId,
      });

      return {
        message: 'Subscriber created successfully',
        id: saved.id,
        email: saved.email,
      };
    } catch (error) {
      if (error instanceof QueryFailedError) {
        const code = (error as any)?.driverError?.code;
        if (code === '23505') {
          throw new ConflictException('Subscriber email already exists');
        }
      }
      throw error;
    }
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
      .orderBy('s.source', 'ASC')
      .getRawMany<{ source: string }>();

    // If your subscriber entity has clinicalRole field, use it; otherwise derive from profile metadata table later.
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

  async listAdvanced(
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

    // engagement rollup from delivery recipients
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
        },
        clinicalRole: s.clinicalRole ?? null,
        source: s.source ?? null,
        received: m.received,
        opened: m.opened,
        engagementRatePercent: engagementRate,
        joinedDate: s.subscribedAt,
        status: s.status,
        actions: {
          view: true,
          edit: true,
          toggleStatus: true,
        },
      };
    });

    if (query.minMessagesReceived !== undefined) {
      rows = rows.filter((r) => r.received >= query.minMessagesReceived!);
    }
    if (query.minOpenRatePercent !== undefined) {
      rows = rows.filter(
        (r) => r.engagementRatePercent >= query.minOpenRatePercent!,
      );
    }

    // in-memory secondary sort for metrics sorts
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

    const [activeCount, unsubCount, bouncedCount] = await Promise.all([
      this.subscriberRepo.count({
        where: { status: NewsletterSubscriberStatus.ACTIVE } as any,
      }),
      this.subscriberRepo.count({
        where: { status: NewsletterSubscriberStatus.UNSUBSCRIBED } as any,
      }),
      this.subscriberRepo
        .count({ where: { status: 'BOUNCED' as any } as any })
        .catch(() => 0),
    ]);

    return {
      items: rows,
      meta: { page, limit, total },
      cards: {
        netGrowth: { totalSubscribers: total },
        avgEngagement: {
          percent:
            rows.length > 0
              ? Number(
                  (
                    rows.reduce((sum, r) => sum + r.engagementRatePercent, 0) /
                    rows.length
                  ).toFixed(1),
                )
              : 0,
        },
        listHealth: {
          activeCount,
          unsubscribedCount: unsubCount,
          bouncedCount,
        },
        topSources: await this.getTopSourcesBreakdown(),
      },
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
    const clickedCount = recipientRows.filter((r) => !!r.firstClickedAt).length;
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
        courseAttendanceCount: 0, // integrate course/order module later
        lifetimeValue: 0, // integrate orders later
      },
      adminNotes: notes.map((n) => ({
        id: n.id,
        note: n.note,
        createdAt: n.createdAt,
        createdByAdminId: n.createdByAdminId,
      })),
      tabs: {
        orders: {
          endpoint: `/admin/newsletters/general/subscribers/${subscriberId}/order-history`,
        },
        newsletters: {
          endpoint: `/admin/newsletters/general/subscribers/${subscriberId}/newsletter-history`,
        },
      },
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
    // dynamic import style not needed; assume NewsletterBroadcast repo available in service if you inject it.
    // If not injected yet, inject @InjectRepository(NewsletterBroadcast) private readonly broadcastRepo...
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

    // TODO: Integrate orders/products/courses module.
    // Returning stable contract so UI can wire immediately.
    return {
      items: [],
      meta: { page: query.page ?? 1, limit: query.limit ?? 10, total: 0 },
      integrationStatus: 'PENDING_ORDER_MODULE_ADAPTER',
    };
  }

  private async getTopSourcesBreakdown(): Promise<
    Array<{ source: string; count: number }>
  > {
    const rows = await this.subscriberRepo
      .createQueryBuilder('s')
      .select('s.source', 'source')
      .addSelect('COUNT(*)', 'count')
      .where('s.source IS NOT NULL')
      .groupBy('s.source')
      .orderBy('COUNT(*)', 'DESC')
      .limit(5)
      .getRawMany<{ source: string; count: string }>();

    return rows.map((r) => ({ source: r.source, count: Number(r.count) }));
  }
}
