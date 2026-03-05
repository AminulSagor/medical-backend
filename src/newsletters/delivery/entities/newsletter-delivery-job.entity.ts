import { NewsletterDeliveryJobStatus } from 'src/common/enums/newsletter-constants.enum';
import { NewsletterBroadcast } from 'src/newsletters/broadcasts/entities/newsletter-broadcast.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('newsletter_delivery_jobs')
export class NewsletterDeliveryJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  broadcastId: string;

  @ManyToOne(() => NewsletterBroadcast, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'broadcastId' })
  broadcast: NewsletterBroadcast;

  @Column({
    type: 'enum',
    enum: NewsletterDeliveryJobStatus,
    enumName: 'newsletter_delivery_job_status_enum',
    default: NewsletterDeliveryJobStatus.QUEUED,
  })
  @Index()
  jobStatus: NewsletterDeliveryJobStatus;

  @Column({ type: 'timestamptz' })
  @Index()
  scheduledExecutionAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'int', default: 0 })
  totalRecipients: number;

  @Column({ type: 'int', default: 0 })
  successCount: number;

  @Column({ type: 'int', default: 0 })
  failureCount: number;

  @Column({ type: 'varchar', length: 150, nullable: true })
  provider: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  providerBatchId: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  errorSummary: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  @Index()
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
