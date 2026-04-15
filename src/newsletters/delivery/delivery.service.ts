import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { NewsletterBroadcast } from '../broadcasts/entities/newsletter-broadcast.entity';
import { BroadcastPreviewService } from '../broadcasts/broadcast-preview.service';
import { NewsletterDeliveryJob } from './entities/newsletter-delivery-job.entity';
import { NewsletterDeliveryRecipient } from './entities/newsletter-delivery-recipient.entity';
import { NewsletterSubscriber } from '../audience/entities/newsletter-subscriber.entity';

import { ProviderAdapterService } from './provider-adapter.service';
import {
  NewsletterBroadcastStatus,
  NewsletterDeliveryJobStatus,
  NewsletterDeliveryRecipientStatus,
  NewsletterSubscriberStatus,
} from 'src/common/enums/newsletter-constants.enum';

@Injectable()
export class DeliveryService {
  constructor(
    @InjectRepository(NewsletterBroadcast)
    private readonly broadcastRepo: Repository<NewsletterBroadcast>,
    @InjectRepository(NewsletterDeliveryJob)
    private readonly deliveryJobRepo: Repository<NewsletterDeliveryJob>,
    @InjectRepository(NewsletterDeliveryRecipient)
    private readonly deliveryRecipientRepo: Repository<NewsletterDeliveryRecipient>,
    @InjectRepository(NewsletterSubscriber)
    private readonly subscriberRepo: Repository<NewsletterSubscriber>,
    private readonly previewService: BroadcastPreviewService,
    private readonly providerAdapter: ProviderAdapterService,
  ) {}

  async createDeliveryJobForBroadcast(
    broadcastId: string,
  ): Promise<NewsletterDeliveryJob> {
    const broadcast = await this.broadcastRepo.findOne({
      where: { id: broadcastId },
    });
    if (!broadcast) throw new NotFoundException('Broadcast not found');

    const existing = await this.deliveryJobRepo.findOne({
      where: {
        broadcastId,
        jobStatus: In([
          NewsletterDeliveryJobStatus.QUEUED,
          NewsletterDeliveryJobStatus.PROCESSING,
        ]),
      },
      order: { createdAt: 'DESC' },
    });

    if (existing) {
      return existing;
    }

    const job = this.deliveryJobRepo.create({
      broadcastId: broadcast.id,
      jobStatus: NewsletterDeliveryJobStatus.QUEUED,
      scheduledExecutionAt: broadcast.scheduledAt ?? new Date(),
      totalRecipients: 0,
      successCount: 0,
      failureCount: 0,
    });

    return this.deliveryJobRepo.save(job);
  }

  async processDueJobs(now: Date = new Date()): Promise<number> {
    const jobs = await this.deliveryJobRepo.find({
      where: { jobStatus: NewsletterDeliveryJobStatus.QUEUED },
      take: 10,
      order: { scheduledExecutionAt: 'ASC' },
    });

    let processed = 0;

    for (const job of jobs) {
      if (job.scheduledExecutionAt > now) continue;
      await this.processJob(job.id);
      processed += 1;
    }

    return processed;
  }

  async processJob(jobId: string): Promise<void> {
    const job = await this.deliveryJobRepo.findOne({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Delivery job not found');

    if (
      ![
        NewsletterDeliveryJobStatus.QUEUED,
        NewsletterDeliveryJobStatus.FAILED,
      ].includes(job.jobStatus)
    ) {
      return;
    }

    job.jobStatus = NewsletterDeliveryJobStatus.PROCESSING;
    job.startedAt = new Date();
    job.errorSummary = null;
    await this.deliveryJobRepo.save(job);

    const broadcast = await this.broadcastRepo.findOne({
      where: { id: job.broadcastId },
      relations: ['customContent', 'articleLink'],
    });

    if (!broadcast) {
      job.jobStatus = NewsletterDeliveryJobStatus.FAILED;
      job.errorSummary = 'Broadcast not found';
      job.completedAt = new Date();
      await this.deliveryJobRepo.save(job);
      return;
    }

    const subscribers = await this.subscriberRepo.find({
      where: { status: NewsletterSubscriberStatus.ACTIVE },
      order: { createdAt: 'ASC' },
    });

    if (!subscribers.length) {
      job.totalRecipients = 0;
      job.successCount = 0;
      job.failureCount = 0;
      job.jobStatus = NewsletterDeliveryJobStatus.FAILED;
      job.errorSummary = 'No active newsletter subscribers found';
      job.completedAt = new Date();
      await this.deliveryJobRepo.save(job);

      broadcast.status = NewsletterBroadcastStatus.FAILED;
      broadcast.lastError = job.errorSummary;
      broadcast.updatedByAdminId = broadcast.updatedByAdminId;
      await this.broadcastRepo.save(broadcast);
      return;
    }

    const html = this.buildBroadcastHtml(broadcast);
    const text = this.buildBroadcastText(broadcast);

    let deliveryRecipients = await this.deliveryRecipientRepo.find({
      where: { deliveryJobId: job.id },
      order: { createdAt: 'ASC' },
    });

    if (!deliveryRecipients.length) {
      deliveryRecipients = await this.deliveryRecipientRepo.save(
        subscribers.map((subscriber) =>
          this.deliveryRecipientRepo.create({
            deliveryJobId: job.id,
            broadcastId: broadcast.id,
            subscriberId: subscriber.id,
            emailSnapshot: subscriber.email,
            deliveryStatus: NewsletterDeliveryRecipientStatus.PENDING,
          }),
        ),
      );
    }

    job.totalRecipients = deliveryRecipients.length;
    await this.deliveryJobRepo.save(job);

    const subscriberMap = new Map(subscribers.map((row) => [row.id, row]));

    const sendResult = await this.providerAdapter.sendBatch({
      subject: broadcast.subjectLine,
      html,
      text,
      recipients: deliveryRecipients.map((recipient) => ({
        email: recipient.emailSnapshot,
        subscriberId: recipient.subscriberId,
        deliveryRecipientId: recipient.id,
        tags: {
          broadcastId: broadcast.id,
          deliveryJobId: job.id,
          deliveryRecipientId: recipient.id,
        },
      })),
    });

    const resultMap = new Map(
      sendResult.recipientResults.map((result) => [
        result.deliveryRecipientId ??
          `${result.email}-${result.subscriberId ?? ''}`,
        result,
      ]),
    );

    for (const recipient of deliveryRecipients) {
      const result =
        resultMap.get(recipient.id) ??
        resultMap.get(`${recipient.emailSnapshot}-${recipient.subscriberId}`);

      if (!result) continue;

      recipient.providerMessageId = result.providerMessageId ?? null;
      recipient.sentAt = result.accepted ? new Date() : recipient.sentAt;
      recipient.deliveryStatus = result.accepted
        ? NewsletterDeliveryRecipientStatus.SENT
        : NewsletterDeliveryRecipientStatus.FAILED;
      recipient.failureReason = result.accepted
        ? null
        : (result.errorMessage ?? 'Send failed');
    }

    await this.deliveryRecipientRepo.save(deliveryRecipients);

    const sentSubscriberIds = deliveryRecipients
      .filter(
        (recipient) =>
          recipient.deliveryStatus === NewsletterDeliveryRecipientStatus.SENT,
      )
      .map((recipient) => recipient.subscriberId);

    if (sentSubscriberIds.length) {
      const sentSubscribers = sentSubscriberIds
        .map((id) => subscriberMap.get(id))
        .filter((row): row is NewsletterSubscriber => Boolean(row));
      const now = new Date();
      for (const subscriber of sentSubscribers) {
        subscriber.lastEmailSentAt = now;
      }
      await this.subscriberRepo.save(sentSubscribers);
    }

    job.provider = sendResult.provider;
    job.providerBatchId = sendResult.providerBatchId ?? null;
    job.successCount = sendResult.acceptedCount;
    job.failureCount = sendResult.failedCount;
    job.jobStatus =
      sendResult.acceptedCount === 0
        ? NewsletterDeliveryJobStatus.FAILED
        : sendResult.failedCount > 0
          ? NewsletterDeliveryJobStatus.PARTIAL
          : NewsletterDeliveryJobStatus.COMPLETED;
    job.errorSummary =
      sendResult.failedCount > 0
        ? `${sendResult.failedCount} recipient(s) failed to send`
        : null;
    job.completedAt = new Date();

    await this.deliveryJobRepo.save(job);

    broadcast.status =
      job.jobStatus === NewsletterDeliveryJobStatus.FAILED
        ? NewsletterBroadcastStatus.FAILED
        : NewsletterBroadcastStatus.SENT;
    broadcast.sentAt =
      sendResult.acceptedCount > 0 ? new Date() : broadcast.sentAt;
    broadcast.sentRecipientsCount = sendResult.acceptedCount;
    broadcast.lastError = job.errorSummary;

    await this.broadcastRepo.save(broadcast);
  }

  private buildBroadcastHtml(broadcast: NewsletterBroadcast): string {
    const preview = this.previewService.buildPreviewPayload(
      broadcast,
      broadcast.customContent
        ? {
            messageBodyHtml: broadcast.customContent.messageBodyHtml,
            messageBodyText: broadcast.customContent.messageBodyText,
          }
        : null,
      broadcast.articleLink
        ? {
            sourceTitleSnapshot: broadcast.articleLink.sourceTitleSnapshot,
            sourceExcerptSnapshot: broadcast.articleLink.sourceExcerptSnapshot,
            sourceHeroImageUrlSnapshot:
              broadcast.articleLink.sourceHeroImageUrlSnapshot,
            ctaLabel: broadcast.articleLink.ctaLabel,
          }
        : null,
    ) as { html?: string };

    return preview.html ?? '<html><body></body></html>';
  }

  private buildBroadcastText(broadcast: NewsletterBroadcast): string | null {
    if (broadcast.customContent?.messageBodyText?.trim()) {
      return broadcast.customContent.messageBodyText.trim();
    }

    const html = this.buildBroadcastHtml(broadcast);
    return html
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&#039;/gi, "'")
      .replace(/&quot;/gi, '"')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
