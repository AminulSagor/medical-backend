import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum ProductOrderSummaryStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  EXPIRED = 'expired',
}

export type ProductOrderSummaryItem = {
  productId: string;
  name: string;
  sku: string | null;
  photo: string | null;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
};

@Entity('product_order_summaries')
export class ProductOrderSummary {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 10, default: 'usd' })
  currency: string;

  @Column({ type: 'jsonb' })
  items: ProductOrderSummaryItem[];

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  subtotal: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  shippingAmount: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  taxAmount: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  totalAmount: string;

  @Column({
    type: 'enum',
    enum: ProductOrderSummaryStatus,
    default: ProductOrderSummaryStatus.PENDING,
  })
  status: ProductOrderSummaryStatus;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
