import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';

import {
  NewsletterUnsubscribeRequestStatus,
  NewsletterSubscriberStatus,
} from 'src/common/enums/newsletter-constants.enum';

import { NewsletterUnsubscribeRequest } from './entities/newsletter-unsubscribe-request.entity';
import { NewsletterSubscriber } from '../audience/entities/newsletter-subscriber.entity';

import { ListUnsubscribeRequestsQueryDto } from './dto/list-unsubscribe-requests-query.dto';
import { ConfirmUnsubscribeDto } from './dto/confirm-unsubscribe.dto';
import { DismissUnsubscribeDto } from './dto/dismiss-unsubscribe.dto';
import { BulkProcessUnsubscribeDto } from './dto/bulk-process-unsubscribe.dto';

@Injectable()
export class UnsubscribeService {
  constructor(
    private readonly dataSource: DataSource,

    @InjectRepository(NewsletterUnsubscribeRequest)
    private readonly requestRepo: Repository<NewsletterUnsubscribeRequest>,

    @InjectRepository(NewsletterSubscriber)
    private readonly subscriberRepo: Repository<NewsletterSubscriber>,
  ) {}

  async list(
    query: ListUnsubscribeRequestsQueryDto,
  ): Promise<Record<string, unknown>> {
    const tab = query.tab ?? 'requested';
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const status =
      tab === 'requested'
        ? NewsletterUnsubscribeRequestStatus.PENDING
        : NewsletterUnsubscribeRequestStatus.PROCESSED;

    const qb = this.requestRepo
      .createQueryBuilder('r')
      .where('r.status = :status', { status });

    if (query.search?.trim()) {
      const s = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere('LOWER(r.email) LIKE :s', { s });
    }

    qb.orderBy(tab === 'requested' ? 'r.requestedAt' : 'r.processedAt', 'DESC');
    qb.skip((page - 1) * limit).take(limit);

    const [items, total] = await qb.getManyAndCount();

    // Map subscriber data safely (since relation isn't explicitly defined in DB entity)
    const subscriberIds = [
      ...new Set(items.map((r) => r.subscriberId).filter(Boolean)),
    ];
    const subscribers = subscriberIds.length
      ? await this.subscriberRepo.findBy({ id: In(subscriberIds) })
      : [];
    const subMap = new Map(subscribers.map((s) => [s.id, s]));

    // Top cards
    const pendingCount = await this.requestRepo.count({
      where: { status: NewsletterUnsubscribeRequestStatus.PENDING },
    });
    const processedCount = await this.requestRepo.count({
      where: { status: NewsletterUnsubscribeRequestStatus.PROCESSED },
    });

    return {
      cards: {
        pendingRequests: pendingCount,
        totalUnsubscribed: processedCount,
        avgResponseTimeLabel: '2h', // MVP Mock
      },
      tab,
      items: items.map((r) => {
        const sub = r.subscriberId ? subMap.get(r.subscriberId) : null;
        const name = sub?.fullName || null;

        return {
          id: r.id,
          subscriberIdentity: {
            fullName: name,
            email: r.email,
            avatarInitials: (name || r.email || '')
              .split(/\s+/)
              .slice(0, 2)
              .map((p) => p[0] || '')
              .join('')
              .toUpperCase(),
          },
          requestDate: r.requestedAt,
          sourceSegment: r.source || 'General Newsletter',
          feedback: r.notes ?? null,
          // Map to match UI exactly
          status:
            r.status === NewsletterUnsubscribeRequestStatus.PENDING
              ? 'PENDING'
              : 'UNSUBSCRIBED',
        };
      }),
      meta: { page, limit, total },
    };
  }

  async getDetail(id: string): Promise<Record<string, unknown>> {
    const r = await this.requestRepo.findOne({ where: { id } });
    if (!r) throw new NotFoundException('Unsubscribe request not found');

    const subscriber = r.subscriberId
      ? await this.subscriberRepo.findOne({ where: { id: r.subscriberId } })
      : null;

    // Formatting date to match UI ("Jan 2024")
    const memberSinceDate = subscriber?.subscribedAt
      ? subscriber.subscribedAt.toLocaleString('en-US', {
          month: 'short',
          year: 'numeric',
        })
      : 'Unknown';

    return {
      modal: {
        title: 'Unsubscription Details',
      },
      subscriber: subscriber
        ? {
            id: subscriber.id,
            fullName: subscriber.fullName,
            email: subscriber.email,
            status: subscriber.status,
            clinicalRole: (subscriber as any).clinicalRole || 'General Member',
            avatarInitials: (subscriber.fullName || subscriber.email || '')
              .split(/\s+/)
              .slice(0, 2)
              .map((p) => p[0] || '')
              .join('')
              .toUpperCase(),
          }
        : {
            id: null,
            fullName: null,
            email: r.email,
            status: null,
            clinicalRole: 'Guest',
            avatarInitials: r.email[0].toUpperCase(),
          },
      request: {
        id: r.id,
        createdAt: r.requestedAt,
        source: r.source || 'General Newsletter',
        feedback: r.notes ?? null,
        status: r.status,
      },
      activity: {
        // Formatted to directly feed the modal UI Timeline
        timeline: [
          { label: 'Member Since', value: memberSinceDate, active: true },
          {
            label: 'Course Completed',
            value: 'Advanced Airway Management',
            active: false,
          },
          {
            label: 'Gear Purchased',
            value: 'Airway Algorithm Card',
            active: false,
          },
        ],
      },
      actions: {
        confirm: r.status === NewsletterUnsubscribeRequestStatus.PENDING,
        dismiss: r.status === NewsletterUnsubscribeRequestStatus.PENDING,
      },
    };
  }

  async confirm(
    adminUserId: string,
    requestId: string,
    dto: ConfirmUnsubscribeDto,
  ): Promise<Record<string, unknown>> {
    const req = await this.requestRepo.findOne({ where: { id: requestId } });
    if (!req) throw new NotFoundException('Unsubscribe request not found');

    await this.dataSource.transaction(async (manager) => {
      if (req.subscriberId) {
        const sub = await manager.findOne(NewsletterSubscriber, {
          where: { id: req.subscriberId },
        });
        if (sub) {
          sub.status = NewsletterSubscriberStatus.UNSUBSCRIBED;
          sub.unsubscribedAt = new Date();
          sub.unsubscribeReason =
            dto.reason?.trim() || 'Unsubscribed by request';
          sub.updatedByAdminId = adminUserId;
          await manager.save(NewsletterSubscriber, sub);
        }
      }

      req.status = NewsletterUnsubscribeRequestStatus.PROCESSED;
      req.processedAt = new Date();
      req.processedByAdminId = adminUserId;
      await manager.save(NewsletterUnsubscribeRequest, req);
    });

    return {
      message: 'Unsubscription confirmed',
      id: req.id,
      email: req.email,
      successModal: {
        title: 'Unsubscription Confirmed',
        payload: {
          subscriberEmail: req.email,
          statusLabel: 'Removed from General Newsletter',
        },
        ctaLabel: 'Done',
      },
    };
  }

  async dismiss(
    adminUserId: string,
    requestId: string,
    dto: DismissUnsubscribeDto,
  ): Promise<Record<string, unknown>> {
    const req = await this.requestRepo.findOne({ where: { id: requestId } });
    if (!req) throw new NotFoundException('Unsubscribe request not found');

    // Reject the request, keeps subscriber Active
    req.status = NewsletterUnsubscribeRequestStatus.REJECTED;
    req.processedAt = new Date();
    req.processedByAdminId = adminUserId;
    if (dto.note?.trim()) req.notes = dto.note.trim();

    await this.requestRepo.save(req);

    return {
      message: 'Request dismissed',
      id: req.id,
      email: req.email,
    };
  }

  async restore(
    adminUserId: string,
    requestId: string,
  ): Promise<Record<string, unknown>> {
    const req = await this.requestRepo.findOne({ where: { id: requestId } });
    if (!req) throw new NotFoundException('Unsubscribe request not found');

    await this.dataSource.transaction(async (manager) => {
      // 1. Restore the subscriber to ACTIVE
      if (req.subscriberId) {
        const sub = await manager.findOne(NewsletterSubscriber, {
          where: { id: req.subscriberId },
        });
        if (sub) {
          sub.status = NewsletterSubscriberStatus.ACTIVE;
          sub.unsubscribedAt = null;
          sub.unsubscribeReason = null;
          sub.updatedByAdminId = adminUserId;
          await manager.save(NewsletterSubscriber, sub);
        }
      }

      // 2. Reject/Archive the request so it falls out of the Unsubscribed view
      req.status = NewsletterUnsubscribeRequestStatus.REJECTED;
      req.notes = 'Restored by admin';
      req.processedByAdminId = adminUserId;
      req.processedAt = new Date();
      await manager.save(NewsletterUnsubscribeRequest, req);
    });

    return {
      message: 'Subscriber successfully restored and reactivated.',
      id: req.id,
      email: req.email,
    };
  }

  async bulkProcess(
    adminUserId: string,
    dto: BulkProcessUnsubscribeDto,
  ): Promise<Record<string, unknown>> {
    const requests = await this.requestRepo.findBy({
      id: In(dto.requestIds),
    });
    if (!requests.length) throw new NotFoundException('No requests found');

    const breakdown = new Map<string, number>();
    for (const r of requests) {
      const key = r.source || 'General Newsletter';
      breakdown.set(key, (breakdown.get(key) ?? 0) + 1);
    }

    // Process all
    for (const r of requests) {
      await this.confirm(adminUserId, r.id, {
        reason: 'Bulk processed',
        sendConfirmationEmail: dto.sendConfirmationEmail,
      });
    }

    return {
      message: 'Bulk unsubscriptions processed',
      id: dto.requestIds[0],
      processedCount: dto.requestIds.length,
      breakdown: [...breakdown.entries()].map(([source, count]) => ({
        source,
        count,
      })),
    };
  }

  async markAllProcessed(
    adminUserId: string,
  ): Promise<Record<string, unknown>> {
    const pending = await this.requestRepo.find({
      where: { status: NewsletterUnsubscribeRequestStatus.PENDING },
      select: ['id'],
    });

    if (!pending.length) {
      return { message: 'No pending requests to process.' };
    }

    const ids = pending.map((p) => p.id);
    return this.bulkProcess(adminUserId, {
      requestIds: ids,
      permanentlyRemoveFromLists: true,
      sendConfirmationEmail: false,
    });
  }

  async exportUnsubscribed(): Promise<Record<string, unknown>> {
    const rows = await this.subscriberRepo.find({
      where: { status: NewsletterSubscriberStatus.UNSUBSCRIBED },
      order: { unsubscribedAt: 'DESC' as any },
      take: 5000,
    });

    return {
      items: rows.map((s) => ({
        email: s.email,
        fullName: s.fullName,
        unsubscribedAt: s.unsubscribedAt,
        reason: s.unsubscribeReason,
        source: s.source,
      })),
    };
  }

  async syncBlocklist(_adminUserId: string): Promise<Record<string, unknown>> {
    return {
      message: 'Blocklist sync started',
      id: 'blocklist',
    };
  }

  async publicUnsubscribe(token: string): Promise<Record<string, unknown>> {
    const email = token.trim().toLowerCase();

    if (!email || !email.includes('@')) {
      throw new BadRequestException('Invalid unsubscribe token');
    }

    let subscriber = await this.subscriberRepo.findOne({ where: { email } });

    if (!subscriber) {
      subscriber = await this.subscriberRepo.save(
        this.subscriberRepo.create({
          email,
          fullName: null,
          status: NewsletterSubscriberStatus.UNSUBSCRIBED,
          source: 'SYSTEM',
          unsubscribedAt: new Date(),
          unsubscribeReason: 'Public unsubscribe link',
        }),
      );
    } else {
      subscriber.status = NewsletterSubscriberStatus.UNSUBSCRIBED;
      subscriber.unsubscribedAt = new Date();
      subscriber.unsubscribeReason = 'Public unsubscribe link';
      subscriber = await this.subscriberRepo.save(subscriber);
    }

    const reqEntity = this.requestRepo.create({
      subscriberId: subscriber.id,
      email: subscriber.email,
      status: NewsletterUnsubscribeRequestStatus.PROCESSED, // Skips pending
      source: 'LINK_CLICK',
      processedAt: new Date(),
    });
    await this.requestRepo.save(reqEntity);

    return {
      message: 'You have been unsubscribed successfully !',
      id: subscriber.id,
      identifier: subscriber.email,
    };
  }
}
