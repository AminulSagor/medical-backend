import { NewsletterSubscriberStatus } from 'src/common/enums/newsletter-constants.enum';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Entity('newsletter_subscribers')
@Unique('uq_newsletter_subscribers_email', ['email'])
export class NewsletterSubscriber {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  @Index()
  email: string; // normalized lowercase

  @Column({ type: 'varchar', length: 180, nullable: true })
  fullName: string | null;

  @Column({
    type: 'enum',
    enum: NewsletterSubscriberStatus,
    enumName: 'newsletter_subscriber_status_enum',
    default: NewsletterSubscriberStatus.ACTIVE,
  })
  @Index()
  status: NewsletterSubscriberStatus;

  @Column({ type: 'varchar', length: 40, default: 'MANUAL' })
  source: string;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  subscribedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  unsubscribedAt: Date | null;

  @Column({ type: 'varchar', length: 250, nullable: true })
  unsubscribeReason: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastEmailSentAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  createdByAdminId: string | null;

  @Column({ type: 'uuid', nullable: true })
  updatedByAdminId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
