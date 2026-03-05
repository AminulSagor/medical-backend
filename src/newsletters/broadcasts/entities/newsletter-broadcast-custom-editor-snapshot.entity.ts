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

@Entity('newsletter_broadcast_custom_editor_snapshots')
export class NewsletterBroadcastCustomEditorSnapshot {
  @PrimaryColumn('uuid')
  broadcastId: string;

  @OneToOne(() => NewsletterBroadcast, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'broadcastId' })
  broadcast: NewsletterBroadcast;

  @Column({ type: 'varchar', length: 40, default: 'LEXICAL_JSON_STRING' })
  format: string;

  // Serialized editor state as opaque artifact (atomic from DB perspective)
  @Column({ type: 'text' })
  serializedState: string;

  @Column({ type: 'int', default: 1 })
  schemaVersion: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
