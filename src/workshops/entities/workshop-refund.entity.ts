import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Workshop } from './workshop.entity';
import { WorkshopReservation } from './workshop-reservation.entity';
import { WorkshopRefundItem } from './workshop-refund-item.entity';

export enum WorkshopRefundType {
  FULL = 'FULL',
  PARTIAL = 'PARTIAL',
}

export enum WorkshopRefundStatus {
  PENDING = 'PENDING',
  PROCESSED = 'PROCESSED',
}

@Entity('workshop_refunds')
export class WorkshopRefund {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 50, unique: true, nullable: true })
  requestId?: string; // Format: #REF-REQ-001

  @Index()
  @Column({ type: 'uuid' })
  workshopId: string;

  @Index()
  @Column({ type: 'uuid' })
  reservationId: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  userId?: string; // Student who requested the refund

  @Index()
  @Column({ type: 'uuid', nullable: true })
  processedByAdminId?: string;

  @Column({ type: 'enum', enum: WorkshopRefundType, nullable: true })
  refundType?: WorkshopRefundType;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  refundAmount: string;

  @Column({ type: 'text', nullable: true })
  reason?: string; // Reason for refund request

  @Column({ type: 'text', nullable: true })
  adjustmentNote?: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  paymentGateway?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  transactionId?: string;

  @Column({
    type: 'enum',
    enum: WorkshopRefundStatus,
    default: WorkshopRefundStatus.PENDING,
  })
  status: WorkshopRefundStatus;

  @Column({ type: 'timestamptz', nullable: true })
  processedAt?: Date;

  @ManyToOne(() => Workshop, { eager: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workshopId' })
  workshop: Workshop;

  @ManyToOne(() => WorkshopReservation, { eager: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reservationId' })
  reservation: WorkshopReservation;

  @OneToMany(() => WorkshopRefundItem, (item) => item.refund, {
    cascade: true,
    eager: true,
  })
  items: WorkshopRefundItem[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
