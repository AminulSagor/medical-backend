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
import { WorkshopRefund } from './workshop-refund.entity';
import { WorkshopAttendee } from './workshop-attendee.entity';

export enum WorkshopRefundItemStatus {
  REFUNDED = 'REFUNDED',
  PARTIAL_REFUNDED = 'PARTIAL_REFUNDED',
}

@Entity('workshop_refund_items')
export class WorkshopRefundItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  refundId: string;

  @Index()
  @Column({ type: 'uuid' })
  attendeeId: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  refundAmount: string;

  @Column({ type: 'enum', enum: WorkshopRefundItemStatus })
  status: WorkshopRefundItemStatus;

  @ManyToOne(() => WorkshopRefund, (refund) => refund.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'refundId' })
  refund: WorkshopRefund;

  @ManyToOne(() => WorkshopAttendee, { eager: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'attendeeId' })
  attendee: WorkshopAttendee;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
