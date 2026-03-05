import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NewsletterAuditLog } from './entities/newsletter-audit-log.entity';

interface AuditLogInput {
  entityType: string;
  entityId: string;
  action: string;
  performedByAdminId: string;
  beforeSnapshot?: unknown;
  afterSnapshot?: unknown;
  meta?: unknown;
}

@Injectable()
export class NewsletterAuditService {
  constructor(
    @InjectRepository(NewsletterAuditLog)
    private readonly auditRepo: Repository<NewsletterAuditLog>,
  ) {}

  async log(input: AuditLogInput): Promise<void> {
    const row = this.auditRepo.create({
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      performedByAdminId: input.performedByAdminId,
      beforeSnapshotText:
        input.beforeSnapshot !== undefined
          ? JSON.stringify(input.beforeSnapshot)
          : null,
      afterSnapshotText:
        input.afterSnapshot !== undefined
          ? JSON.stringify(input.afterSnapshot)
          : null,
      metaText: input.meta !== undefined ? JSON.stringify(input.meta) : null,
    });

    await this.auditRepo.save(row);
  }
}
