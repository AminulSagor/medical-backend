import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToOne,
} from 'typeorm';
import { UserAuthIdentity } from './user-auth-identity.entity';

export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
  STUDENT = 'student',
  INSTRUCTOR = 'instructor',
}

export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 200 })
  fullLegalName: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  firstName?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  lastName?: string;

  @Index('UQ_users_medicalEmail', { unique: true })
  @Column({ type: 'varchar', length: 320 })
  medicalEmail: string;

  @Column({ type: 'varchar', length: 150 })
  professionalRole: string;

  @Column({ type: 'text', nullable: true })
  profilePhotoUrl?: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phoneNumber?: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  professionalTitle?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  institutionOrHospital?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  npiNumber?: string;

  // Default shipping address used in public checkout flow
  @Column({ type: 'varchar', length: 200, nullable: true })
  shippingFullName?: string;

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

  @Column({ type: 'varchar', length: 255, nullable: true })
  password: string;

  @Column({ type: 'boolean', default: false })
  isVerified: boolean;

  // ✅ ADD THIS (admin/user)
  @Column({ type: 'enum', enum: UserRole, default: UserRole.STUDENT })
  role: UserRole;

  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.ACTIVE })
  status: UserStatus;

  @Column({ type: 'text', nullable: true })
  credentials?: string;

  @Column({ type: 'int', default: 0 })
  coursesCount: number;

  @Column({ type: 'timestamptz', nullable: true })
  lastActiveAt?: Date;

  @OneToOne(() => UserAuthIdentity, (authIdentity) => authIdentity.user, {
    cascade: true,
    eager: false,
  })
  authIdentity: UserAuthIdentity;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
