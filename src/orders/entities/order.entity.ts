import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  FulfillmentStatus,
  OrderType,
  PaymentStatus,
} from 'src/common/enums/order.enums';
import { OrderItem } from './order-item.entity';
import { OrderTimeline } from './order-timeline.entity';

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 40 })
  orderNumber: string;

  @Column({ type: 'enum', enum: OrderType, default: OrderType.PRODUCT })
  type: OrderType;

  // customer snapshot
  @Column({ type: 'varchar', length: 150 })
  customerName: string;

  @Index()
  @Column({ type: 'varchar', length: 180 })
  customerEmail: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  customerPhone?: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  customerAvatar?: string;

  // shipping snapshot
  @Column({ type: 'varchar', length: 180, nullable: true })
  shippingCompany?: string;

  @Column({ type: 'varchar', length: 180, nullable: true })
  shippingAttention?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  shippingAddressLine1?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  shippingAddressLine2?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  shippingCity?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  shippingState?: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  shippingPostalCode?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  shippingCountry?: string;

  // money
  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  subtotal: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  shippingAmount: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  taxAmount: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  grandTotal: string;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
  paymentStatus: PaymentStatus;

  @Column({
    type: 'enum',
    enum: FulfillmentStatus,
    default: FulfillmentStatus.UNFULFILLED,
  })
  fulfillmentStatus: FulfillmentStatus;

  // dispatch
  @Column({ type: 'varchar', length: 100, nullable: true })
  carrier?: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  trackingNumber?: string;

  @Column({ type: 'timestamp', nullable: true })
  estimatedDeliveryDate?: Date;

  @Column({ type: 'text', nullable: true })
  shippingNotes?: string;

  @OneToMany(() => OrderItem, (item) => item.order, {
    cascade: true,
    eager: true,
  })
  items: OrderItem[];

  @OneToMany(() => OrderTimeline, (timeline) => timeline.order, {
    cascade: true,
    eager: true,
  })
  timeline: OrderTimeline[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
