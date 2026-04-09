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
  PROCESSED = 'PROCESSED',
}

@Entity('workshop_refunds')
export class WorkshopRefund {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  workshopId: string;

  @Index()
  @Column({ type: 'uuid' })
  reservationId: string;

  @Index()
  @Column({ type: 'uuid' })
  processedByAdminId: string;

  @Column({ type: 'enum', enum: WorkshopRefundType })
  refundType: WorkshopRefundType;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  refundAmount: string;

  @Column({ type: 'text', nullable: true })
  adjustmentNote?: string;

  @Column({ type: 'varchar', length: 120 })
  paymentGateway: string;

  @Column({ type: 'varchar', length: 255 })
  transactionId: string;

  @Column({
    type: 'enum',
    enum: WorkshopRefundStatus,
    default: WorkshopRefundStatus.PROCESSED,
  })
  status: WorkshopRefundStatus;

  @Column({ type: 'timestamptz' })
  processedAt: Date;

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
