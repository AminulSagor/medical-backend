// import {
//   BadRequestException,
//   Injectable,
//   NotFoundException,
// } from '@nestjs/common';
// import { InjectRepository } from '@nestjs/typeorm';
// import { Repository } from 'typeorm';
// import { NewsletterUnsubscribeRequest } from './entities/newsletter-unsubscribe-request.entity';
// import { NewsletterSubscriber } from '../audience/entities/newsletter-subscriber.entity';
// import { ListUnsubscribeRequestsQueryDto } from './dto/list-unsubscribe-requests-query.dto';
// import { ProcessUnsubscribeRequestDto } from './dto/process-unsubscribe-request.dto';
// import { NewsletterAuditService } from '../audit/newsletter-audit.service';
// import {
//   NewsletterSubscriberStatus,
//   NewsletterUnsubscribeRequestStatus,
// } from 'src/common/enums/newsletter-constants.enum';

// @Injectable()
// export class UnsubscribeService {
//   constructor(
//     @InjectRepository(NewsletterUnsubscribeRequest)
//     private readonly unsubscribeRequestRepo: Repository<NewsletterUnsubscribeRequest>,
//     @InjectRepository(NewsletterSubscriber)
//     private readonly subscriberRepo: Repository<NewsletterSubscriber>,
//     private readonly auditService: NewsletterAuditService,
//   ) {}

//   async list(
//     query: ListUnsubscribeRequestsQueryDto,
//   ): Promise<Record<string, unknown>> {
//     const page = query.page ?? 1;
//     const limit = query.limit ?? 10;

//     const qb = this.unsubscribeRequestRepo.createQueryBuilder('r');

//     if (query.status) {
//       qb.andWhere('r.status = :status', { status: query.status });
//     }

//     qb.orderBy('r.requestedAt', 'DESC')
//       .skip((page - 1) * limit)
//       .take(limit);

//     const [rows, total] = await qb.getManyAndCount();

//     return {
//       items: rows.map((r) => ({
//         id: r.id,
//         email: r.email,
//         status: r.status,
//         source: r.source,
//         requestedAt: r.requestedAt,
//         processedAt: r.processedAt,
//       })),
//       meta: { page, limit, total },
//     };
//   }

//   async process(
//     adminUserId: string,
//     id: string,
//     dto: ProcessUnsubscribeRequestDto,
//   ): Promise<Record<string, unknown>> {
//     const request = await this.unsubscribeRequestRepo.findOne({
//       where: { id },
//     });
//     if (!request) throw new NotFoundException('Unsubscribe request not found');

//     if (
//       ![
//         NewsletterUnsubscribeRequestStatus.PROCESSED,
//         NewsletterUnsubscribeRequestStatus.REJECTED,
//       ].includes(dto.status)
//     ) {
//       throw new BadRequestException('status must be PROCESSED or REJECTED');
//     }

//     request.status = dto.status;
//     request.notes = dto.notes?.trim() || request.notes || null;
//     request.processedByAdminId = adminUserId;
//     request.processedAt = new Date();

//     if (dto.status === NewsletterUnsubscribeRequestStatus.PROCESSED) {
//       const subscriber = await this.subscriberRepo.findOne({
//         where: { email: request.email.toLowerCase() },
//       });

//       if (subscriber) {
//         subscriber.status = NewsletterSubscriberStatus.UNSUBSCRIBED;
//         subscriber.unsubscribedAt = new Date();
//         subscriber.unsubscribeReason = 'Unsubscribe request processed by admin';
//         subscriber.updatedByAdminId = adminUserId;
//         await this.subscriberRepo.save(subscriber);
//         request.subscriberId = subscriber.id;
//       }
//     }

//     const saved = await this.unsubscribeRequestRepo.save(request);

//     await this.auditService.log({
//       entityType: 'UNSUBSCRIBE_REQUEST',
//       entityId: saved.id,
//       action: 'PROCESS',
//       performedByAdminId: adminUserId,
//       meta: { status: saved.status },
//     });

//     return {
//       message: 'Unsubscribe request processed successfully',
//       id: saved.id,
//       identifier: saved.email,
//     };
//   }

//   async publicUnsubscribe(token: string): Promise<Record<string, unknown>> {
//     // TODO: Replace with signed token validation (JWT/HMAC)
//     // MVP token is treated as raw email for local testing
//     const email = token.trim().toLowerCase();

//     if (!email || !email.includes('@')) {
//       throw new BadRequestException('Invalid unsubscribe token');
//     }

//     let subscriber = await this.subscriberRepo.findOne({ where: { email } });

//     if (!subscriber) {
//       subscriber = await this.subscriberRepo.save(
//         this.subscriberRepo.create({
//           email,
//           fullName: null,
//           status: NewsletterSubscriberStatus.UNSUBSCRIBED,
//           source: 'SYSTEM',
//           unsubscribedAt: new Date(),
//           unsubscribeReason: 'Public unsubscribe link',
//         }),
//       );
//     } else {
//       subscriber.status = NewsletterSubscriberStatus.UNSUBSCRIBED;
//       subscriber.unsubscribedAt = new Date();
//       subscriber.unsubscribeReason = 'Public unsubscribe link';
//       subscriber = await this.subscriberRepo.save(subscriber);
//     }

//     const reqEntity = this.unsubscribeRequestRepo.create({
//       subscriberId: subscriber.id,
//       email: subscriber.email,
//       status: NewsletterUnsubscribeRequestStatus.PROCESSED,
//       source: 'LINK_CLICK',
//       processedAt: new Date(),
//     });
//     await this.unsubscribeRequestRepo.save(reqEntity);

//     return {
//       message: 'You have been unsubscribed successfully',
//       id: subscriber.id,
//       identifier: subscriber.email,
//     };
//   }
// }

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

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
      .leftJoin(NewsletterSubscriber, 's', 's.id = r.subscriberId')
      .where('r.status = :status', { status });

    if (query.search?.trim()) {
      const s = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere(
        "(LOWER(r.email) LIKE :s OR LOWER(COALESCE(s.fullName, '')) LIKE :s)",
        { s },
      );
    }

    qb.orderBy('r.createdAt', 'DESC');
    qb.skip((page - 1) * limit).take(limit);

    const [items, total] = await qb.getManyAndCount();

    // top cards
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
        avgResponseTimeLabel: '2h', // compute later from processedAt-createdAt
      },
      tab,
      items: items.map((r: any) => ({
        id: r.id,
        subscriber: {
          name: r.s_fullName ?? null,
          email: r.email,
        },
        requestDate: r.createdAt,
        sourceSegment: r.source, // existing column
        feedback: r.notes ?? null,
        status: r.status,
        actions: {
          view: true,
          confirm: tab === 'requested',
          dismiss: tab === 'requested',
        },
      })),
      meta: { page, limit, total },
    };
  }

  async getDetail(id: string): Promise<Record<string, unknown>> {
    const r = await this.requestRepo.findOne({ where: { id } });
    if (!r) throw new NotFoundException('Unsubscribe request not found');

    const subscriber = r.subscriberId
      ? await this.subscriberRepo.findOne({ where: { id: r.subscriberId } })
      : null;

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
            memberSince: subscriber.subscribedAt,
          }
        : {
            id: null,
            fullName: null,
            email: r.email,
            status: null,
            memberSince: null,
          },
      request: {
        id: r.id,
        createdAt: r.requestedAt,
        source: r.source,
        feedback: r.notes ?? null,
        status: r.status,
      },
      activity: {
        // plug-in real data later (courses/orders)
        timeline: [],
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
      // process subscriber
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

  async bulkProcess(
    adminUserId: string,
    dto: BulkProcessUnsubscribeDto,
  ): Promise<Record<string, unknown>> {
    const requests = await this.requestRepo.findBy({
      id: dto.requestIds as any,
    });
    if (!requests.length) throw new NotFoundException('No requests found');

    const breakdown = new Map<string, number>();
    for (const r of requests) {
      const key = r.source || 'General Newsletter';
      breakdown.set(key, (breakdown.get(key) ?? 0) + 1);
    }

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

  async exportUnsubscribed(): Promise<Record<string, unknown>> {
    // return structured data; frontend can generate CSV
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
    // provider sync placeholder (SES/SendGrid suppression list)
    // implement provider adapter later
    return {
      message: 'Blocklist sync started',
      id: 'blocklist',
    };
  }

  async publicUnsubscribe(token: string): Promise<Record<string, unknown>> {
    // TODO: Replace with signed token validation (JWT/HMAC)
    // MVP token is treated as raw email for local testing
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
      status: NewsletterUnsubscribeRequestStatus.PROCESSED,
      source: 'LINK_CLICK',
      processedAt: new Date(),
    });
    await this.requestRepo.save(reqEntity);

    return {
      message: 'You have been unsubscribed successfully',
      id: subscriber.id,
      identifier: subscriber.email,
    };
  }
}
