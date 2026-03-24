import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { NewsletterBroadcastCustomContent } from './newsletter-broadcast-custom-content.entity';

@Entity('newsletter_broadcast_custom_content_tokens')
@Unique('uq_newsletter_custom_content_token_broadcast_token', [
  'broadcastId',
  'token',
])
export class NewsletterBroadcastCustomContentToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  broadcastId: string;

  @ManyToOne(() => NewsletterBroadcastCustomContent, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'broadcastId', referencedColumnName: 'broadcastId' })
  customContent: NewsletterBroadcastCustomContent;

  @Column({ type: 'varchar', length: 80 })
  token: string; // e.g. Student_Name

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
