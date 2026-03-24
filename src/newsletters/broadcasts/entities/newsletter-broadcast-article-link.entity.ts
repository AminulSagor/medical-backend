import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { NewsletterBroadcast } from './newsletter-broadcast.entity';
import { NewsletterArticleSourceType } from 'src/common/enums/newsletter-constants.enum';

@Entity('newsletter_broadcast_article_links')
export class NewsletterBroadcastArticleLink {
  @PrimaryColumn('uuid')
  broadcastId: string;

  @OneToOne(() => NewsletterBroadcast, (b) => b.articleLink, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'broadcastId' })
  broadcast: NewsletterBroadcast;

  @Column({
    type: 'enum',
    enum: NewsletterArticleSourceType,
    enumName: 'newsletter_article_source_type_enum',
  })
  sourceType: NewsletterArticleSourceType;

  @Column({ type: 'uuid' })
  sourceRefId: string; // blog/article ID from source system

  // snapshots for stable history/preview
  @Column({ type: 'varchar', length: 220 })
  sourceTitleSnapshot: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  sourceExcerptSnapshot: string | null;

  @Column({ type: 'varchar', length: 180, nullable: true })
  sourceAuthorSnapshot: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  sourceHeroImageUrlSnapshot: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  sourcePublishedAtSnapshot: Date | null;

  @Column({ type: 'int', nullable: true })
  estimatedReadMinutesSnapshot: number | null;

  @Column({ type: 'varchar', length: 80, default: 'Read Full Article' })
  ctaLabel: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
