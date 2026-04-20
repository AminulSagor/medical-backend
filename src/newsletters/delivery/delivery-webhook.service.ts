import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { Repository } from 'typeorm';

import { NewsletterTransmissionEvent } from './entities/newsletter-transmission-event.entity';
import { NewsletterDeliveryRecipient } from './entities/newsletter-delivery-recipient.entity';
import { NewsletterBroadcast } from '../broadcasts/entities/newsletter-broadcast.entity';
import {
  NewsletterDeliveryRecipientStatus,
  NewsletterTransmissionEventType,
} from 'src/common/enums/newsletter-constants.enum';

@Injectable()
export class DeliveryWebhookService {
  constructor(
    @InjectRepository(NewsletterTransmissionEvent)
    private readonly eventRepo: Repository<NewsletterTransmissionEvent>,
    @InjectRepository(NewsletterDeliveryRecipient)
    private readonly recipientRepo: Repository<NewsletterDeliveryRecipient>,
    @InjectRepository(NewsletterBroadcast)
    private readonly broadcastRepo: Repository<NewsletterBroadcast>,
    private readonly configService: ConfigService,
  ) {}

  async ingestProviderEvents(input: {
    provider: string;
    signature?: string | null;
    payload: any;
  }): Promise<Record<string, unknown>> {
    this.assertValidSignature(input.signature, input.payload);

    const providerPayload = this.normalizePayload(input.payload);
    const normalizedProvider = input.provider?.toUpperCase?.() || 'UNKNOWN';
    const providerEventId = this.resolveProviderEventId(providerPayload);
    const eventType = this.resolveEventType(providerPayload);
    const occurredAt = this.resolveOccurredAt(providerPayload);

    const existingEvent = providerEventId
      ? await this.eventRepo.findOne({
          where: {
            provider: normalizedProvider,
            providerEventId,
          },
        })
      : null;

    if (existingEvent) {
      return {
        message: 'Webhook payload already processed',
        id: existingEvent.id,
        provider: existingEvent.provider,
      };
    }

    const tagValues = this.extractTagValues(providerPayload);
    const broadcastId =
      tagValues.broadcastId ??
      this.extractBroadcastIdFromHeaders(providerPayload);
    const deliveryRecipientId = tagValues.deliveryRecipientId ?? null;
    const deliveryJobId = tagValues.deliveryJobId ?? null;
    const email = this.extractEmail(providerPayload);

    let recipient: NewsletterDeliveryRecipient | null = null;

    if (deliveryRecipientId) {
      recipient = await this.recipientRepo.findOne({
        where: { id: deliveryRecipientId },
      });
    }

    if (!recipient && providerEventId) {
      recipient = await this.recipientRepo.findOne({
        where: { providerMessageId: providerEventId },
      });
    }

    if (!recipient && email && broadcastId) {
      recipient = await this.recipientRepo.findOne({
        where: { emailSnapshot: email, broadcastId },
      });
    }

    const row = await this.eventRepo.save(
      this.eventRepo.create({
        provider: normalizedProvider,
        providerEventId,
        broadcastId: recipient?.broadcastId ?? broadcastId ?? null,
        deliveryJobId: recipient?.deliveryJobId ?? deliveryJobId ?? null,
        deliveryRecipientId: recipient?.id ?? null,
        eventType,
        payloadText: JSON.stringify(providerPayload),
        occurredAt,
      }),
    );

    if (recipient) {
      switch (eventType) {
        case NewsletterTransmissionEventType.DELIVERED:
          recipient.deliveredAt = recipient.deliveredAt ?? occurredAt;
          recipient.deliveryStatus =
            NewsletterDeliveryRecipientStatus.DELIVERED;
          recipient.failureReason = null;
          break;

        case NewsletterTransmissionEventType.OPENED:
          recipient.firstOpenedAt = recipient.firstOpenedAt ?? occurredAt;
          recipient.openCount = (recipient.openCount ?? 0) + 1;
          recipient.deliveryStatus = NewsletterDeliveryRecipientStatus.OPENED;
          break;

        case NewsletterTransmissionEventType.CLICKED:
          recipient.firstClickedAt = recipient.firstClickedAt ?? occurredAt;
          recipient.clickCount = (recipient.clickCount ?? 0) + 1;
          recipient.deliveryStatus = NewsletterDeliveryRecipientStatus.CLICKED;
          break;

        case NewsletterTransmissionEventType.BOUNCED:
          recipient.deliveryStatus = NewsletterDeliveryRecipientStatus.BOUNCED;
          recipient.failureReason = this.extractFailureReason(providerPayload);
          break;

        case NewsletterTransmissionEventType.DROPPED:
          recipient.deliveryStatus = NewsletterDeliveryRecipientStatus.DROPPED;
          recipient.failureReason = this.extractFailureReason(providerPayload);
          break;

        case NewsletterTransmissionEventType.FAILED:
          recipient.deliveryStatus = NewsletterDeliveryRecipientStatus.FAILED;
          recipient.failureReason = this.extractFailureReason(providerPayload);
          break;
      }

      await this.recipientRepo.save(recipient);
      await this.refreshBroadcastAnalytics(recipient.broadcastId);
    }

    return {
      message: 'Webhook payload accepted',
      id: row.id,
      provider: row.provider,
    };
  }

  private assertValidSignature(
    signature: string | null | undefined,
    payload: any,
  ): void {
    const secret = this.configService
      .get<string>('NEWSLETTER_WEBHOOK_SECRET')
      ?.trim();

    if (!secret) {
      throw new UnauthorizedException(
        'NEWSLETTER_WEBHOOK_SECRET is not configured',
      );
    }

    if (!signature?.trim()) {
      throw new UnauthorizedException('Missing webhook signature');
    }

    const expected = this.buildSignature(secret, payload);
    const received = this.normalizeSignature(signature);

    if (!this.safeCompare(received, expected)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
  }

  private buildSignature(secret: string, payload: any): string {
    const serialized = JSON.stringify(payload ?? {});
    const digest = createHmac('sha256', secret)
      .update(serialized)
      .digest('hex');

    return `sha256=${digest}`;
  }

  private normalizeSignature(signature: string): string {
    const trimmed = signature.trim();
    return trimmed.startsWith('sha256=') ? trimmed : `sha256=${trimmed}`;
  }

  private safeCompare(a: string, b: string): boolean {
    const aBuffer = Buffer.from(a);
    const bBuffer = Buffer.from(b);

    if (aBuffer.length !== bBuffer.length) {
      return false;
    }

    return timingSafeEqual(aBuffer, bBuffer);
  }

  private normalizePayload(payload: any): any {
    if (
      payload?.Type === 'Notification' &&
      typeof payload?.Message === 'string'
    ) {
      try {
        return JSON.parse(payload.Message);
      } catch {
        return payload;
      }
    }

    return payload;
  }

  private resolveProviderEventId(payload: any): string | null {
    return (
      payload?.mail?.messageId ??
      payload?.messageId ??
      payload?.eventId ??
      payload?.notificationId ??
      null
    );
  }

  private resolveOccurredAt(payload: any): Date {
    const raw =
      payload?.delivery?.timestamp ??
      payload?.open?.timestamp ??
      payload?.click?.timestamp ??
      payload?.bounce?.timestamp ??
      payload?.mail?.timestamp ??
      payload?.timestamp;

    const parsed = raw ? new Date(raw) : new Date();
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }

  private resolveEventType(payload: any): NewsletterTransmissionEventType {
    const raw = String(payload?.eventType ?? '').toUpperCase();

    switch (raw) {
      case 'DELIVERY':
        return NewsletterTransmissionEventType.DELIVERED;
      case 'OPEN':
        return NewsletterTransmissionEventType.OPENED;
      case 'CLICK':
        return NewsletterTransmissionEventType.CLICKED;
      case 'BOUNCE':
        return NewsletterTransmissionEventType.BOUNCED;
      case 'REJECT':
      case 'COMPLAINT':
        return NewsletterTransmissionEventType.FAILED;
      case 'SEND':
        return NewsletterTransmissionEventType.SENT;
      default:
        return NewsletterTransmissionEventType.FAILED;
    }
  }

  private extractEmail(payload: any): string | null {
    const destination = payload?.mail?.destination;
    if (Array.isArray(destination) && destination.length > 0) {
      return String(destination[0]).toLowerCase();
    }
    return null;
  }

  private extractBroadcastIdFromHeaders(payload: any): string | null {
    const headers = payload?.mail?.headers;
    if (!Array.isArray(headers)) return null;

    const match = headers.find(
      (header: any) => String(header?.name).toLowerCase() === 'x-broadcast-id',
    );

    return match?.value ?? null;
  }

  private extractTagValues(payload: any): Record<string, string | null> {
    const tags = payload?.mail?.tags ?? {};

    const read = (key: string) => {
      const value = tags?.[key];
      if (Array.isArray(value) && value.length > 0) return String(value[0]);
      if (typeof value === 'string') return value;
      return null;
    };

    return {
      broadcastId: read('broadcastId'),
      deliveryJobId: read('deliveryJobId'),
      deliveryRecipientId: read('deliveryRecipientId'),
    };
  }

  private extractFailureReason(payload: any): string | null {
    return (
      payload?.bounce?.bouncedRecipients?.[0]?.diagnosticCode ??
      payload?.bounce?.bounceType ??
      payload?.failure?.message ??
      payload?.complaint?.complainedRecipients?.[0]?.emailAddress ??
      null
    );
  }

  private async refreshBroadcastAnalytics(broadcastId: string): Promise<void> {
    const broadcast = await this.broadcastRepo.findOne({
      where: { id: broadcastId },
    });
    if (!broadcast) return;

    const recipients = await this.recipientRepo.find({
      where: { broadcastId },
    });
    const sentCount = recipients.filter((row) => row.sentAt).length;
    const openedCount = recipients.filter((row) => row.firstOpenedAt).length;
    const clickedCount = recipients.filter((row) => row.firstClickedAt).length;

    broadcast.sentRecipientsCount = sentCount;
    broadcast.openedRecipientsCount = openedCount;
    broadcast.openRatePercent = sentCount
      ? ((openedCount / sentCount) * 100).toFixed(2)
      : '0.00';
    broadcast.clickRatePercent = sentCount
      ? ((clickedCount / sentCount) * 100).toFixed(2)
      : '0.00';

    await this.broadcastRepo.save(broadcast);
  }
}
