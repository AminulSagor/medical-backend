import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { NewsletterTransmissionEvent } from './entities/newsletter-transmission-event.entity';
import { NewsletterDeliveryRecipient } from './entities/newsletter-delivery-recipient.entity';

@Injectable()
export class DeliveryWebhookService {
  constructor(
    @InjectRepository(NewsletterTransmissionEvent)
    private readonly transmissionEventRepo: Repository<NewsletterTransmissionEvent>,
    @InjectRepository(NewsletterDeliveryRecipient)
    private readonly deliveryRecipientRepo: Repository<NewsletterDeliveryRecipient>,
  ) {}

  async ingestProviderEvents(input: {
    provider: string;
    signature: string | null;
    payload: unknown;
  }): Promise<Record<string, unknown>> {
    // TODO: verify provider signature
    // TODO: parse provider-specific payload format
    // This stores raw payload safely for replay/testing.
    const row = await this.transmissionEventRepo.save(
      this.transmissionEventRepo.create({
        provider: input.provider,
        providerEventId: null,
        eventType: 'QUEUED' as any, // TODO map real event type
        payloadText: JSON.stringify(input.payload),
        occurredAt: new Date(),
      }),
    );

    return {
      message: 'Webhook payload accepted',
      id: row.id,
      provider: row.provider,
    };
  }
}
