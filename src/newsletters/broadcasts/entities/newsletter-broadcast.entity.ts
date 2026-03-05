import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  NewsletterChannelType,
  NewsletterContentType,
  NewsletterBroadcastStatus,
  NewsletterFrequencyType,
  NewsletterAudienceMode,
} from 'src/common/enums/newsletter-constants.enum';
import { NewsletterBroadcastCustomContent } from './newsletter-broadcast-custom-content.entity';
import { NewsletterBroadcastArticleLink } from './newsletter-broadcast-article-link.entity';
import { NewsletterBroadcastAttachment } from './newsletter-broadcast-attachment.entity';
import { NewsletterBroadcastSegment } from './newsletter-broadcast-segment.entity';

@Entity('newsletter_broadcasts')
export class NewsletterBroadcast {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: NewsletterChannelType,
    enumName: 'newsletter_channel_type_enum',
  })
  @Index()
  channelType: NewsletterChannelType;

  @Column({
    type: 'enum',
    enum: NewsletterContentType,
    enumName: 'newsletter_content_type_enum',
  })
  contentType: NewsletterContentType;

  @Column({ type: 'varchar', length: 160, nullable: true })
  internalName: string | null; // admin-visible identifier

  @Column({ type: 'varchar', length: 200 })
  subjectLine: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  preheaderText: string | null;

  @Column({
    type: 'enum',
    enum: NewsletterBroadcastStatus,
    enumName: 'newsletter_broadcast_status_enum',
    default: NewsletterBroadcastStatus.DRAFT,
  })
  @Index()
  status: NewsletterBroadcastStatus;

  @Column({
    type: 'enum',
    enum: NewsletterFrequencyType,
    enumName: 'newsletter_frequency_type_enum',
    nullable: true,
  })
  @Index()
  frequencyType: NewsletterFrequencyType | null;

  @Column({ type: 'timestamptz', nullable: true })
  @Index()
  scheduledAt: Date | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  timezone: string | null;

  @Column({ type: 'int', nullable: true })
  cadenceVersionAtScheduling: number | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  cadenceAnchorLabel: string | null; // e.g. Friday Morning Anchor

  @Column({
    type: 'enum',
    enum: NewsletterAudienceMode,
    enumName: 'newsletter_audience_mode_enum',
    default: NewsletterAudienceMode.SEGMENTS,
  })
  audienceMode: NewsletterAudienceMode;

  @Column({ type: 'int', default: 0 })
  estimatedRecipientsCount: number;

  // minimal analytics cache fields for MVP list/dashboard
  @Column({ type: 'int', default: 0 })
  sentRecipientsCount: number;

  @Column({ type: 'int', default: 0 })
  openedRecipientsCount: number;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0 })
  openRatePercent: string; // TypeORM returns numeric as string in PG

  @Column({ type: 'timestamptz', nullable: true })
  sentAt: Date | null;

  @Column({ type: 'uuid' })
  createdByAdminId: string;

  @Column({ type: 'uuid' })
  updatedByAdminId: string;

  @Column({ type: 'uuid', nullable: true })
  cancelledByAdminId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  cancellationReason: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  lastError: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  @Index()
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @OneToOne(() => NewsletterBroadcastCustomContent, (c) => c.broadcast, {
    nullable: true,
  })
  customContent?: NewsletterBroadcastCustomContent;

  @OneToOne(() => NewsletterBroadcastArticleLink, (a) => a.broadcast, {
    nullable: true,
  })
  articleLink?: NewsletterBroadcastArticleLink;

  @OneToMany(() => NewsletterBroadcastAttachment, (a) => a.broadcast)
  attachments?: NewsletterBroadcastAttachment[];

  @OneToMany(() => NewsletterBroadcastSegment, (bs) => bs.broadcast)
  broadcastSegments?: NewsletterBroadcastSegment[];
}
