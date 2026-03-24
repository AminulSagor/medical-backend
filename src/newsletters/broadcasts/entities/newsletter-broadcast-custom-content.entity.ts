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

@Entity('newsletter_broadcast_custom_contents')
export class NewsletterBroadcastCustomContent {
  @PrimaryColumn('uuid')
  broadcastId: string;

  @OneToOne(() => NewsletterBroadcast, (b) => b.customContent, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'broadcastId' })
  broadcast: NewsletterBroadcast;

  @Column({ type: 'text' })
  messageBodyHtml: string;

  @Column({ type: 'text', nullable: true })
  messageBodyText: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
