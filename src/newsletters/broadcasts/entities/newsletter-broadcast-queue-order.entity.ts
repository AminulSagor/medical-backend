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
import { NewsletterBroadcast } from './newsletter-broadcast.entity';

@Entity('newsletter_broadcast_queue_orders')
@Unique('uq_newsletter_broadcast_queue_orders_broadcast', ['broadcastId'])
@Unique('uq_newsletter_broadcast_queue_orders_scope_seq', [
  'channelType',
  'frequencyType',
  'sequenceIndex',
])
export class NewsletterBroadcastQueueOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  broadcastId: string;

  @ManyToOne(() => NewsletterBroadcast, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'broadcastId' })
  broadcast: NewsletterBroadcast;

  @Column({ type: 'varchar', length: 30 })
  @Index()
  channelType: string; // GENERAL

  @Column({ type: 'varchar', length: 20, nullable: true })
  @Index()
  frequencyType: string | null; // WEEKLY / MONTHLY for queue views

  @Column({ type: 'int' })
  @Index()
  sequenceIndex: number; // 1..N for queue UI ordering

  @Column({ type: 'uuid', nullable: true })
  updatedByAdminId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
