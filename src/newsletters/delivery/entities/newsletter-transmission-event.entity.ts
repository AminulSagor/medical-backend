import { NewsletterTransmissionEventType } from 'src/common/enums/newsletter-constants.enum';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

@Entity('newsletter_transmission_events')
@Unique('uq_newsletter_transmission_events_provider_event', [
  'provider',
  'providerEventId',
])
export class NewsletterTransmissionEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  @Index()
  broadcastId: string | null;

  @Column({ type: 'uuid', nullable: true })
  @Index()
  deliveryJobId: string | null;

  @Column({ type: 'uuid', nullable: true })
  @Index()
  deliveryRecipientId: string | null;

  @Column({
    type: 'enum',
    enum: NewsletterTransmissionEventType,
    enumName: 'newsletter_transmission_event_type_enum',
  })
  @Index()
  eventType: NewsletterTransmissionEventType;

  @Column({ type: 'varchar', length: 80 })
  @Index()
  provider: string; // SES, SendGrid, etc.

  @Column({ type: 'varchar', length: 255, nullable: true })
  providerEventId: string | null;

  // Strict NF preference: store raw payload as serialized text
  @Column({ type: 'text', nullable: true })
  payloadText: string | null;

  @Column({ type: 'timestamptz' })
  @Index()
  occurredAt: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
