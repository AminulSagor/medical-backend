import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NewsletterUnsubscribeRequest } from './entities/newsletter-unsubscribe-request.entity';
import { NewsletterSubscriber } from '../audience/entities/newsletter-subscriber.entity';
import { ListUnsubscribeRequestsQueryDto } from './dto/list-unsubscribe-requests-query.dto';
import { ProcessUnsubscribeRequestDto } from './dto/process-unsubscribe-request.dto';
import { NewsletterAuditService } from '../audit/newsletter-audit.service';
import {
  NewsletterSubscriberStatus,
  NewsletterUnsubscribeRequestStatus,
} from 'src/common/enums/newsletter-constants.enum';

@Injectable()
export class UnsubscribeService {
  constructor(
    @InjectRepository(NewsletterUnsubscribeRequest)
    private readonly unsubscribeRequestRepo: Repository<NewsletterUnsubscribeRequest>,
    @InjectRepository(NewsletterSubscriber)
    private readonly subscriberRepo: Repository<NewsletterSubscriber>,
    private readonly auditService: NewsletterAuditService,
  ) {}

  async list(
    query: ListUnsubscribeRequestsQueryDto,
  ): Promise<Record<string, unknown>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const qb = this.unsubscribeRequestRepo.createQueryBuilder('r');

    if (query.status) {
      qb.andWhere('r.status = :status', { status: query.status });
    }

    qb.orderBy('r.requestedAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [rows, total] = await qb.getManyAndCount();

    return {
      items: rows.map((r) => ({
        id: r.id,
        email: r.email,
        status: r.status,
        source: r.source,
        requestedAt: r.requestedAt,
        processedAt: r.processedAt,
      })),
      meta: { page, limit, total },
    };
  }

  async process(
    adminUserId: string,
    id: string,
    dto: ProcessUnsubscribeRequestDto,
  ): Promise<Record<string, unknown>> {
    const request = await this.unsubscribeRequestRepo.findOne({
      where: { id },
    });
    if (!request) throw new NotFoundException('Unsubscribe request not found');

    if (
      ![
        NewsletterUnsubscribeRequestStatus.PROCESSED,
        NewsletterUnsubscribeRequestStatus.REJECTED,
      ].includes(dto.status)
    ) {
      throw new BadRequestException('status must be PROCESSED or REJECTED');
    }

    request.status = dto.status;
    request.notes = dto.notes?.trim() || request.notes || null;
    request.processedByAdminId = adminUserId;
    request.processedAt = new Date();

    if (dto.status === NewsletterUnsubscribeRequestStatus.PROCESSED) {
      const subscriber = await this.subscriberRepo.findOne({
        where: { email: request.email.toLowerCase() },
      });

      if (subscriber) {
        subscriber.status = NewsletterSubscriberStatus.UNSUBSCRIBED;
        subscriber.unsubscribedAt = new Date();
        subscriber.unsubscribeReason = 'Unsubscribe request processed by admin';
        subscriber.updatedByAdminId = adminUserId;
        await this.subscriberRepo.save(subscriber);
        request.subscriberId = subscriber.id;
      }
    }

    const saved = await this.unsubscribeRequestRepo.save(request);

    await this.auditService.log({
      entityType: 'UNSUBSCRIBE_REQUEST',
      entityId: saved.id,
      action: 'PROCESS',
      performedByAdminId: adminUserId,
      meta: { status: saved.status },
    });

    return {
      message: 'Unsubscribe request processed successfully',
      id: saved.id,
      identifier: saved.email,
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

    const reqEntity = this.unsubscribeRequestRepo.create({
      subscriberId: subscriber.id,
      email: subscriber.email,
      status: NewsletterUnsubscribeRequestStatus.PROCESSED,
      source: 'LINK_CLICK',
      processedAt: new Date(),
    });
    await this.unsubscribeRequestRepo.save(reqEntity);

    return {
      message: 'You have been unsubscribed successfully',
      id: subscriber.id,
      identifier: subscriber.email,
    };
  }
}
