import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, createVerify, timingSafeEqual } from 'crypto';
import { get } from 'https';
import { Repository } from 'typeorm';

import { NewsletterTransmissionEvent } from './entities/newsletter-transmission-event.entity';
import { NewsletterDeliveryRecipient } from './entities/newsletter-delivery-recipient.entity';
import { NewsletterBroadcast } from '../broadcasts/entities/newsletter-broadcast.entity';
import {
  NewsletterDeliveryRecipientStatus,
  NewsletterTransmissionEventType,
} from 'src/common/enums/newsletter-constants.enum';

type WebhookSource =
  | 'custom'
  | 'sns-notification'
  | 'sns-subscription-confirmation'
  | 'sns-unsubscribe-confirmation';

@Injectable()
export class DeliveryWebhookService {
  private readonly snsCertificateCache = new Map<string, string>();

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
    const source = await this.verifyWebhookSource(
      input.signature,
      input.payload,
    );

    if (source === 'sns-subscription-confirmation') {
      await this.confirmSnsSubscription(input.payload);

      return {
        message: 'SNS subscription confirmed',
        provider: 'SNS',
      };
    }

    if (source === 'sns-unsubscribe-confirmation') {
      return {
        message: 'SNS unsubscribe confirmation received',
        provider: 'SNS',
      };
    }

    const providerPayload = this.normalizePayload(input.payload);
    const normalizedProvider = this.resolveProvider(
      input.provider,
      providerPayload,
    );
    const eventType = this.resolveEventType(providerPayload);
    const occurredAt = this.resolveOccurredAt(providerPayload);
    const providerMessageId = this.resolveProviderMessageId(providerPayload);
    const providerEventId = this.resolveProviderEventId(
      providerPayload,
      eventType,
      occurredAt,
      providerMessageId,
    );

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

    if (!recipient && providerMessageId) {
      recipient = await this.recipientRepo.findOne({
        where: { providerMessageId },
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
          recipient.failureReason = null;

          if (
            [
              NewsletterDeliveryRecipientStatus.PENDING,
              NewsletterDeliveryRecipientStatus.SENT,
              NewsletterDeliveryRecipientStatus.DELIVERED,
            ].includes(recipient.deliveryStatus)
          ) {
            recipient.deliveryStatus =
              NewsletterDeliveryRecipientStatus.DELIVERED;
          }
          break;

        case NewsletterTransmissionEventType.OPENED:
          recipient.firstOpenedAt = recipient.firstOpenedAt ?? occurredAt;
          recipient.openCount = (recipient.openCount ?? 0) + 1;

          if (
            recipient.deliveryStatus !==
            NewsletterDeliveryRecipientStatus.CLICKED
          ) {
            recipient.deliveryStatus = NewsletterDeliveryRecipientStatus.OPENED;
          }
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

  private async verifyWebhookSource(
    signature: string | null | undefined,
    payload: any,
  ): Promise<WebhookSource> {
    if (this.isSnsEnvelope(payload)) {
      await this.assertValidSnsSignature(payload);

      if (payload.Type === 'SubscriptionConfirmation') {
        return 'sns-subscription-confirmation';
      }

      if (payload.Type === 'UnsubscribeConfirmation') {
        return 'sns-unsubscribe-confirmation';
      }

      return 'sns-notification';
    }

    this.assertValidCustomSignature(signature, payload);
    return 'custom';
  }

  private assertValidCustomSignature(
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

  private isSnsEnvelope(payload: any): boolean {
    return Boolean(
      payload &&
      typeof payload === 'object' &&
      typeof payload.Type === 'string' &&
      typeof payload.MessageId === 'string' &&
      typeof payload.Signature === 'string' &&
      typeof payload.SigningCertURL === 'string',
    );
  }

  private async assertValidSnsSignature(payload: any): Promise<void> {
    this.assertExpectedSnsTopic(payload);

    const certUrl = String(payload.SigningCertURL ?? '');
    const cert = await this.getSnsSigningCertificate(certUrl);
    const stringToSign = this.buildSnsStringToSign(payload);

    const algorithm =
      String(payload.SignatureVersion) === '2' ? 'RSA-SHA256' : 'RSA-SHA1';

    const verifier = createVerify(algorithm);
    verifier.update(stringToSign, 'utf8');
    verifier.end();

    const isValid = verifier.verify(cert, String(payload.Signature), 'base64');

    if (!isValid) {
      throw new UnauthorizedException('Invalid SNS signature');
    }
  }

  private assertExpectedSnsTopic(payload: any): void {
    const expectedTopicArn = this.configService
      .get<string>('NEWSLETTER_SNS_TOPIC_ARN')
      ?.trim();

    if (!expectedTopicArn) return;

    if (payload.TopicArn !== expectedTopicArn) {
      throw new UnauthorizedException('Unexpected SNS topic');
    }
  }

  private buildSnsStringToSign(payload: any): string {
    const type = String(payload.Type);

    const fields =
      type === 'Notification'
        ? ['Message', 'MessageId', 'Subject', 'Timestamp', 'TopicArn', 'Type']
        : [
            'Message',
            'MessageId',
            'SubscribeURL',
            'Timestamp',
            'Token',
            'TopicArn',
            'Type',
          ];

    return fields
      .filter(
        (field) => payload[field] !== undefined && payload[field] !== null,
      )
      .map((field) => `${field}\n${payload[field]}`)
      .join('\n');
  }

  private async getSnsSigningCertificate(certUrl: string): Promise<string> {
    const parsedUrl = this.validateSnsUrl(certUrl, true);
    const normalizedUrl = parsedUrl.toString();

    const cached = this.snsCertificateCache.get(normalizedUrl);
    if (cached) return cached;

    const cert = await this.getHttpsText(normalizedUrl);
    this.snsCertificateCache.set(normalizedUrl, cert);

    return cert;
  }

  private async confirmSnsSubscription(payload: any): Promise<void> {
    const subscribeUrl = String(payload?.SubscribeURL ?? '');
    const parsedUrl = this.validateSnsUrl(subscribeUrl, false);

    await this.getHttpsText(parsedUrl.toString());
  }

  private validateSnsUrl(urlValue: string, requirePem: boolean): URL {
    let parsedUrl: URL;

    try {
      parsedUrl = new URL(urlValue);
    } catch {
      throw new UnauthorizedException('Invalid SNS URL');
    }

    const isAmazonSnsHost = /^sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?$/i.test(
      parsedUrl.hostname,
    );

    if (parsedUrl.protocol !== 'https:' || !isAmazonSnsHost) {
      throw new UnauthorizedException('Untrusted SNS URL');
    }

    if (requirePem && !parsedUrl.pathname.endsWith('.pem')) {
      throw new UnauthorizedException('Invalid SNS certificate URL');
    }

    return parsedUrl;
  }

  private getHttpsText(urlValue: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const request = get(urlValue, (response) => {
        const statusCode = response.statusCode ?? 0;

        if (statusCode < 200 || statusCode >= 300) {
          response.resume();
          reject(new Error(`HTTPS request failed with status ${statusCode}`));
          return;
        }

        const chunks: Buffer[] = [];

        response.on('data', (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });

        response.on('end', () => {
          resolve(Buffer.concat(chunks).toString('utf8'));
        });
      });

      request.on('error', reject);
      request.setTimeout(10000, () => {
        request.destroy(new Error('HTTPS request timed out'));
      });
    });
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

  private resolveProvider(inputProvider: string, payload: any): string {
    const provider = inputProvider?.trim();

    if (provider && provider.toUpperCase() !== 'UNKNOWN') {
      return provider.toUpperCase();
    }

    if (payload?.mail?.messageId || payload?.eventType) {
      return 'SES';
    }

    return 'UNKNOWN';
  }

  private resolveProviderMessageId(payload: any): string | null {
    return (
      payload?.mail?.messageId ??
      payload?.mail?.commonHeaders?.messageId ??
      payload?.messageId ??
      null
    );
  }

  private resolveProviderEventId(
    payload: any,
    eventType: NewsletterTransmissionEventType,
    occurredAt: Date,
    providerMessageId: string | null,
  ): string | null {
    const directEventId =
      payload?.eventId ??
      payload?.notificationId ??
      payload?.delivery?.feedbackId ??
      payload?.bounce?.feedbackId ??
      payload?.complaint?.feedbackId ??
      null;

    const baseId = directEventId ?? providerMessageId;

    if (!baseId) {
      return null;
    }

    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          eventType,
          occurredAt: occurredAt.toISOString(),
          providerMessageId,
          clickLink: payload?.click?.link ?? null,
          bounceFeedbackId: payload?.bounce?.feedbackId ?? null,
          complaintFeedbackId: payload?.complaint?.feedbackId ?? null,
          deliveryTimestamp: payload?.delivery?.timestamp ?? null,
          openTimestamp: payload?.open?.timestamp ?? null,
          clickTimestamp: payload?.click?.timestamp ?? null,
          bounceTimestamp: payload?.bounce?.timestamp ?? null,
        }),
      )
      .digest('hex')
      .slice(0, 32);

    return `${baseId}:${eventType}:${fingerprint}`.slice(0, 255);
  }

  private resolveOccurredAt(payload: any): Date {
    const raw =
      payload?.delivery?.timestamp ??
      payload?.open?.timestamp ??
      payload?.click?.timestamp ??
      payload?.bounce?.timestamp ??
      payload?.complaint?.timestamp ??
      payload?.reject?.timestamp ??
      payload?.failure?.timestamp ??
      payload?.mail?.timestamp ??
      payload?.timestamp;

    const parsed = raw ? new Date(raw) : new Date();
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }

  private resolveEventType(payload: any): NewsletterTransmissionEventType {
    const raw = String(payload?.eventType ?? '')
      .trim()
      .replace(/\s+/g, '_')
      .toUpperCase();

    switch (raw) {
      case 'SEND':
        return NewsletterTransmissionEventType.SENT;
      case 'DELIVERY':
        return NewsletterTransmissionEventType.DELIVERED;
      case 'OPEN':
        return NewsletterTransmissionEventType.OPENED;
      case 'CLICK':
        return NewsletterTransmissionEventType.CLICKED;
      case 'BOUNCE':
        return NewsletterTransmissionEventType.BOUNCED;
      case 'REJECT':
        return NewsletterTransmissionEventType.DROPPED;
      case 'COMPLAINT':
      case 'RENDERING_FAILURE':
      case 'DELIVERY_DELAY':
        return NewsletterTransmissionEventType.FAILED;
      default:
        return NewsletterTransmissionEventType.FAILED;
    }
  }

  private extractEmail(payload: any): string | null {
    const destination = payload?.mail?.destination;

    if (Array.isArray(destination) && destination.length > 0) {
      return String(destination[0]).toLowerCase();
    }

    const bouncedEmail = payload?.bounce?.bouncedRecipients?.[0]?.emailAddress;
    if (bouncedEmail) {
      return String(bouncedEmail).toLowerCase();
    }

    const complainedEmail =
      payload?.complaint?.complainedRecipients?.[0]?.emailAddress;
    if (complainedEmail) {
      return String(complainedEmail).toLowerCase();
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
      payload?.reject?.reason ??
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
