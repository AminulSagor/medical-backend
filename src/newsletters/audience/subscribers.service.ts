import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { NewsletterSubscriber } from './entities/newsletter-subscriber.entity';
import { ListSubscribersQueryDto } from './dto/list-subscribers-query.dto';
import { CreateSubscriberDto } from './dto/create-subscriber.dto';
import { UpdateSubscriberDto } from './dto/update-subscriber.dto';
import { NewsletterAuditService } from '../audit/newsletter-audit.service';
import { NewsletterSubscriberStatus } from 'src/common/enums/newsletter-constants.enum';

@Injectable()
export class SubscribersService {
  constructor(
    @InjectRepository(NewsletterSubscriber)
    private readonly subscriberRepo: Repository<NewsletterSubscriber>,
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
}
