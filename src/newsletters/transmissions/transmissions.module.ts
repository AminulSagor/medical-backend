import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TransmissionsController } from './transmissions.controller';
import { TransmissionsService } from './transmissions.service';

import { NewsletterBroadcast } from 'src/newsletters/broadcasts/entities/newsletter-broadcast.entity';
import { NewsletterBroadcastArticleLink } from 'src/newsletters/broadcasts/entities/newsletter-broadcast-article-link.entity';
import { NewsletterBroadcastCustomContent } from 'src/newsletters/broadcasts/entities/newsletter-broadcast-custom-content.entity';
import { NewsletterBroadcastAttachment } from 'src/newsletters/broadcasts/entities/newsletter-broadcast-attachment.entity';
import { NewsletterBroadcastSegment } from 'src/newsletters/broadcasts/entities/newsletter-broadcast-segment.entity';

import { NewsletterDeliveryRecipient } from 'src/newsletters/delivery/entities/newsletter-delivery-recipient.entity';
import { NewsletterTransmissionEvent } from 'src/newsletters/delivery/entities/newsletter-transmission-event.entity';

import { NewsletterAudienceSegment } from 'src/newsletters/audience/entities/newsletter-audience-segment.entity';
import { NewsletterSubscriber } from 'src/newsletters/audience/entities/newsletter-subscriber.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      NewsletterBroadcast,
      NewsletterBroadcastArticleLink,
      NewsletterBroadcastCustomContent,
      NewsletterBroadcastAttachment,
      NewsletterBroadcastSegment,
      NewsletterDeliveryRecipient,
      NewsletterTransmissionEvent,
      NewsletterAudienceSegment,
      NewsletterSubscriber,
    ]),
  ],
  controllers: [TransmissionsController],
  providers: [TransmissionsService],
})
export class TransmissionsModule {}
