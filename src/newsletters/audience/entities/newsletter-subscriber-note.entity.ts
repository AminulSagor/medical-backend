import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { NewsletterSubscriber } from './newsletter-subscriber.entity';

@Entity('newsletter_subscriber_notes')
export class NewsletterSubscriberNote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  subscriberId: string;

  @ManyToOne(() => NewsletterSubscriber, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'subscriberId' })
  subscriber: NewsletterSubscriber;

  @Column({ type: 'text' })
  note: string;

  @Column({ type: 'uuid' })
  @Index()
  createdByAdminId: string;

  @CreateDateColumn({ type: 'timestamptz' })
  @Index()
  createdAt: Date;
}
