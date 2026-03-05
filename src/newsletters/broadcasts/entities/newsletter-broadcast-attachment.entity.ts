import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { NewsletterBroadcast } from './newsletter-broadcast.entity';

@Entity('newsletter_broadcast_attachments')
export class NewsletterBroadcastAttachment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  broadcastId: string;

  @ManyToOne(() => NewsletterBroadcast, (b) => b.attachments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'broadcastId' })
  broadcast: NewsletterBroadcast;

  @Column({ type: 'varchar', length: 300 })
  fileKey: string; // S3 key

  @Column({ type: 'varchar', length: 255 })
  fileName: string;

  @Column({ type: 'varchar', length: 120 })
  mimeType: string;

  @Column({ type: 'bigint' })
  fileSizeBytes: string; // bigint in PG -> string in TS if needed

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @Column({ type: 'uuid' })
  uploadedByAdminId: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
