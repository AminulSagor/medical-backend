import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum PaymentDomainType {
  PRODUCT = 'product',
  WORKSHOP = 'workshop',
}

export enum PaymentProvider {
  STRIPE = 'stripe',
}

export enum PaymentTransactionStatus {
  CREATED = 'created',
  PENDING = 'pending',
  PAID = 'paid',
  FAILED = 'failed',
  EXPIRED = 'expired',
  REFUNDED = 'refunded',
}

@Entity('payment_transactions')
export class PaymentTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'enum', enum: PaymentDomainType })
  domainType: PaymentDomainType;

  @Index()
  @Column({ type: 'varchar', length: 120 })
  domainRefId: string;

  @Column({ type: 'enum', enum: PaymentProvider, default: PaymentProvider.STRIPE })
  provider: PaymentProvider;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 200, nullable: true })
  providerSessionId?: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  providerPaymentIntentId?: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amount: string;

  @Column({ type: 'varchar', length: 10, default: 'usd' })
  currency: string;

  @Column({
    type: 'enum',
    enum: PaymentTransactionStatus,
    default: PaymentTransactionStatus.CREATED,
  })
  status: PaymentTransactionStatus;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 120, nullable: true })
  idempotencyKey?: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  finalizedRefId?: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @Column({ type: 'timestamp', nullable: true })
  paidAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
