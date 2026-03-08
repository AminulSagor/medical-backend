import { NewsletterUnsubscribeRequestStatus } from 'src/common/enums/newsletter-constants.enum';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('newsletter_unsubscribe_requests')
export class NewsletterUnsubscribeRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  subscriberId: string | null;

  @Column({ type: 'varchar', length: 255 })
  @Index()
  email: string; // normalized lowercase

  @Column({
    type: 'enum',
    enum: NewsletterUnsubscribeRequestStatus,
    enumName: 'newsletter_unsubscribe_request_status_enum',
    default: NewsletterUnsubscribeRequestStatus.PENDING,
  })
  @Index()
  status: NewsletterUnsubscribeRequestStatus;

  @Column({ type: 'varchar', length: 40, default: 'LINK_CLICK' })
  source: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  notes: string | null;

  @Column({ type: 'uuid', nullable: true })
  processedByAdminId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  processedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  requestedAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
