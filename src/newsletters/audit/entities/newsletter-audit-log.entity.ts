import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('newsletter_audit_logs')
export class NewsletterAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 60 })
  @Index()
  entityType: string; // BROADCAST, CADENCE, SUBSCRIBER, SEGMENT, etc.

  @Column({ type: 'uuid' })
  @Index()
  entityId: string;

  @Column({ type: 'varchar', length: 60 })
  @Index()
  action: string; // CREATE, UPDATE, SCHEDULE, CANCEL, PROCESS_UNSUBSCRIBE, ...

  @Column({ type: 'uuid' })
  @Index()
  performedByAdminId: string;

  // For strict relational preference, store serialized JSON string snapshots as TEXT
  @Column({ type: 'text', nullable: true })
  beforeSnapshotText: string | null;

  @Column({ type: 'text', nullable: true })
  afterSnapshotText: string | null;

  @Column({ type: 'text', nullable: true })
  metaText: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  @Index()
  createdAt: Date;
}
