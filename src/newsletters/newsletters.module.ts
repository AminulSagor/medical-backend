import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Dashboard
import { DashboardController } from './dashboard/dashboard.controller';
import { DashboardService } from './dashboard/dashboard.service';

// Cadence
import { CadenceController } from './cadence/cadence.controller';
import { CadenceService } from './cadence/cadence.service';
import { NewsletterCadenceSetting } from './cadence/entities/newsletter-cadence-settings.entity';

// Broadcasts
import { BroadcastsController } from './broadcasts/broadcasts.controller';
import { BroadcastsService } from './broadcasts/broadcasts.service';
import { BroadcastComposerService } from './broadcasts/broadcast-composer.service';
import { BroadcastPreviewService } from './broadcasts/broadcast-preview.service';
import { NewsletterBroadcast } from './broadcasts/entities/newsletter-broadcast.entity';
import { NewsletterBroadcastCustomContent } from './broadcasts/entities/newsletter-broadcast-custom-content.entity';
import { NewsletterBroadcastCustomContentToken } from './broadcasts/entities/newsletter-broadcast-custom-content-token.entity';
import { NewsletterBroadcastCustomEditorSnapshot } from './broadcasts/entities/newsletter-broadcast-custom-editor-snapshot.entity';
import { NewsletterBroadcastArticleLink } from './broadcasts/entities/newsletter-broadcast-article-link.entity';
import { NewsletterBroadcastAttachment } from './broadcasts/entities/newsletter-broadcast-attachment.entity';

// Audience
import { SubscribersController } from './audience/subscribers.controller';
import { SubscribersService } from './audience/subscribers.service';
import { AudienceResolverService } from './audience/audience-resolver.service';
import { NewsletterSubscriber } from './audience/entities/newsletter-subscriber.entity';

// Delivery
import { DeliveryService } from './delivery/delivery.service';
import { DeliveryWorkerService } from './delivery/delivery-worker.service';
import { ProviderAdapterService } from './delivery/provider-adapter.service';
import { SesProvider } from './delivery/providers/ses.provider';
import { NewsletterDeliveryJob } from './delivery/entities/newsletter-delivery-job.entity';
import { NewsletterDeliveryRecipient } from './delivery/entities/newsletter-delivery-recipient.entity';
import { NewsletterTransmissionEvent } from './delivery/entities/newsletter-transmission-event.entity';

// Unsubscribe
import {
  PublicUnsubscribeController,
  UnsubscribeController,
} from './unsubscribe/unsubscribe.controller';
import { UnsubscribeService } from './unsubscribe/unsubscribe.service';
import { NewsletterUnsubscribeRequest } from './unsubscribe/entities/newsletter-unsubscribe-request.entity';

// Audit
import { NewsletterAuditService } from './audit/newsletter-audit.service';
import { NewsletterAuditLog } from './audit/entities/newsletter-audit-log.entity';
import { NewsletterBroadcastQueueOrder } from './broadcasts/entities/newsletter-broadcast-queue-order.entity';
import { NewsletterSubscriberNote } from './audience/entities/newsletter-subscriber-note.entity';
import { ArticleSourceAdapterService } from './broadcasts/article-source-adapter.service';
import { DeliveryWebhooksController } from './delivery/delivery-webhooks.controller';
import { DeliveryWebhookService } from './delivery/delivery-webhook.service';
import { BlogArticleSourceService } from './broadcasts/blog-article-source.service';
import { BlogPost } from 'src/blog/entities/blog-post.entity';
import { CourseAnnouncementsModule } from './course-announcements/course-announcements.module';
import { TransmissionsModule } from './transmissions/transmissions.module';
import { PublicSubscribersController } from './audience/public-subscribers.controller';

import { User } from 'src/users/entities/user.entity';
import { Order } from 'src/orders/entities/order.entity';
import { WorkshopOrderSummary } from 'src/workshops/entities/workshop-order-summary.entity';
import { PaymentTransaction } from 'src/payments/entities/payment-transaction.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      // cadence
      NewsletterCadenceSetting,

      // broadcasts
      NewsletterBroadcast,
      NewsletterBroadcastCustomContent,
      NewsletterBroadcastCustomContentToken,
      NewsletterBroadcastCustomEditorSnapshot,
      NewsletterBroadcastArticleLink,
      NewsletterBroadcastAttachment,
      NewsletterBroadcastQueueOrder,

      // audience
      NewsletterSubscriber,
      // NewsletterAudienceSegment,
      // NewsletterSubscriberSegmentMembership,
      NewsletterSubscriberNote,

      // delivery
      NewsletterDeliveryJob,
      NewsletterDeliveryRecipient,
      NewsletterTransmissionEvent,

      // unsubscribe
      NewsletterUnsubscribeRequest,

      // audit
      NewsletterAuditLog,

      BlogPost,
      User,
      Order,
      WorkshopOrderSummary,
      PaymentTransaction,
    ]),
    CourseAnnouncementsModule,
    TransmissionsModule,
  ],
  controllers: [
    DashboardController,
    CadenceController,
    BroadcastsController,
    SubscribersController,
    // SegmentsController,
    UnsubscribeController,
    PublicUnsubscribeController,
    DeliveryWebhooksController,
    PublicSubscribersController,
  ],
  providers: [
    DashboardService,

    CadenceService,

    BroadcastsService,
    BroadcastComposerService,
    BroadcastPreviewService,

    SubscribersService,
    // SegmentsService,
    AudienceResolverService,

    DeliveryService,
    DeliveryWorkerService,
    SesProvider,
    {
      provide: ProviderAdapterService,
      useClass: SesProvider,
    },

    UnsubscribeService,

    NewsletterAuditService,
    ArticleSourceAdapterService,
    DeliveryWebhookService,
    BlogArticleSourceService,
  ],
  exports: [
    BroadcastsService,
    AudienceResolverService,
    DeliveryService,
    NewsletterAuditService,
  ],
})
export class NewslettersModule {}
