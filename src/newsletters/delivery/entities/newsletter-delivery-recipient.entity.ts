import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { NewsletterDeliveryJob } from './newsletter-delivery-job.entity';
import { NewsletterBroadcast } from 'src/newsletters/broadcasts/entities/newsletter-broadcast.entity';
import { NewsletterSubscriber } from 'src/newsletters/audience/entities/newsletter-subscriber.entity';
import { NewsletterDeliveryRecipientStatus } from 'src/common/enums/newsletter-constants.enum';

@Entity('newsletter_delivery_recipients')
@Unique('uq_newsletter_delivery_recipient_job_subscriber', [
  'deliveryJobId',
  'subscriberId',
])
export class NewsletterDeliveryRecipient {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  deliveryJobId: string;

  @ManyToOne(() => NewsletterDeliveryJob, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'deliveryJobId' })
  deliveryJob: NewsletterDeliveryJob;

  @Column({ type: 'uuid' })
  @Index()
  broadcastId: string;

  @ManyToOne(() => NewsletterBroadcast, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'broadcastId' })
  broadcast: NewsletterBroadcast;

  @Column({ type: 'uuid' })
  @Index()
  subscriberId: string;

  @ManyToOne(() => NewsletterSubscriber, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'subscriberId' })
  subscriber: NewsletterSubscriber;

  @Column({ type: 'varchar', length: 255 })
  emailSnapshot: string;

  @Column({
    type: 'enum',
    enum: NewsletterDeliveryRecipientStatus,
    enumName: 'newsletter_delivery_recipient_status_enum',
    default: NewsletterDeliveryRecipientStatus.PENDING,
  })
  @Index()
  deliveryStatus: NewsletterDeliveryRecipientStatus;

  @Column({ type: 'varchar', length: 255, nullable: true })
  providerMessageId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  sentAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  deliveredAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  firstOpenedAt: Date | null;

  @Column({ type: 'int', default: 0 })
  openCount: number;

  @Column({ type: 'timestamptz', nullable: true })
  firstClickedAt: Date | null;

  @Column({ type: 'int', default: 0 })
  clickCount: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  failureReason: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  @Index()
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
