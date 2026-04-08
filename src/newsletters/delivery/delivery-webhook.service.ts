import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { NewsletterTransmissionEvent } from './entities/newsletter-transmission-event.entity';
import { NewsletterDeliveryRecipient } from './entities/newsletter-delivery-recipient.entity';
import { NewsletterDeliveryRecipientStatus } from 'src/common/enums/newsletter-constants.enum';

@Injectable()
export class DeliveryWebhookService {
  constructor(
    @InjectRepository(NewsletterTransmissionEvent)
    private readonly eventRepo: Repository<NewsletterTransmissionEvent>,
    @InjectRepository(NewsletterDeliveryRecipient)
    private readonly recipientRepo: Repository<NewsletterDeliveryRecipient>,
  ) {}

  async ingestProviderEvents(input: {
    provider: string;
    signature?: string | null;
    payload: any;
  }): Promise<Record<string, unknown>> {
    const { provider, payload } = input;

    const row = await this.eventRepo.save(
      this.eventRepo.create({
        provider,
        eventType: payload.eventType || 'UNKNOWN',
        payloadText: JSON.stringify(payload),
        occurredAt: new Date(),
      }),
    );

    const email = payload.mail?.destination?.[0];
    const broadcastId = payload.mail?.headers?.find(
      (h: any) => h.name === 'X-Broadcast-ID',
    )?.value;

    if (email && broadcastId) {
      const recipient = await this.recipientRepo.findOne({
        where: { emailSnapshot: email, broadcastId },
      });

      if (recipient) {
        switch (payload.eventType) {
          case 'Delivery':
            recipient.deliveredAt = new Date();
            recipient.deliveryStatus =
              NewsletterDeliveryRecipientStatus.DELIVERED;
            break;
          case 'Open':
            recipient.firstOpenedAt = recipient.firstOpenedAt ?? new Date();
            break;
          case 'Click':
            recipient.firstClickedAt = recipient.firstClickedAt ?? new Date();
            break;
          case 'Bounce':
            recipient.deliveryStatus =
              NewsletterDeliveryRecipientStatus.BOUNCED;
            break;
        }
        await this.recipientRepo.save(recipient);
      }
    }

    return {
      message: 'Webhook payload accepted',
      id: row.id,
      provider: row.provider,
    };
  }
}
