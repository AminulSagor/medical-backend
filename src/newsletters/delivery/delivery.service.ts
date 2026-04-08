import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { NewsletterBroadcast } from '../broadcasts/entities/newsletter-broadcast.entity';
import { NewsletterDeliveryJob } from './entities/newsletter-delivery-job.entity';
import { NewsletterDeliveryRecipient } from './entities/newsletter-delivery-recipient.entity';
import { NewsletterSubscriber } from '../audience/entities/newsletter-subscriber.entity';

import { ProviderAdapterService } from './provider-adapter.service';
import {
  NewsletterBroadcastStatus,
  NewsletterDeliveryJobStatus,
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
    // @InjectRepository(NewsletterBroadcastSegment)
    // private readonly broadcastSegmentRepo: Repository<NewsletterBroadcastSegment>,
    @InjectRepository(NewsletterSubscriber)
    private readonly subscriberRepo: Repository<NewsletterSubscriber>,
    private readonly providerAdapter: ProviderAdapterService,
  ) {}

  async createDeliveryJobForBroadcast(
    broadcastId: string,
  ): Promise<NewsletterDeliveryJob> {
    const broadcast = await this.broadcastRepo.findOne({
      where: { id: broadcastId },
    });
    if (!broadcast) throw new NotFoundException('Broadcast not found');

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

    // Rely purely on the overall broadcast estimation since we are targeting ALL_SUBSCRIBERS
    job.totalRecipients = broadcast.estimatedRecipientsCount ?? 0;

    // TODO: Build real HTML via BroadcastPreviewService and resolve actual subscribers from AudienceResolverService
    const sendResult = await this.providerAdapter.sendBatch({
      subject: broadcast.subjectLine,
      html: '<html><body>TODO</body></html>',
      recipients: [],
    });

    job.provider = sendResult.provider;
    job.providerBatchId = sendResult.providerBatchId ?? null;
    job.successCount = sendResult.acceptedCount;
    job.failureCount = sendResult.failedCount;
    job.jobStatus =
      sendResult.failedCount > 0
        ? NewsletterDeliveryJobStatus.PARTIAL
        : NewsletterDeliveryJobStatus.COMPLETED;
    job.completedAt = new Date();

    await this.deliveryJobRepo.save(job);

    broadcast.status =
      job.jobStatus === NewsletterDeliveryJobStatus.COMPLETED ||
      job.jobStatus === NewsletterDeliveryJobStatus.PARTIAL
        ? NewsletterBroadcastStatus.SENT
        : NewsletterBroadcastStatus.FAILED;

    broadcast.sentAt = new Date();
    broadcast.sentRecipientsCount = job.successCount;
    broadcast.updatedAt = new Date();

    await this.broadcastRepo.save(broadcast);
  }
}
