import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToMany,
  JoinTable,
  OneToMany,
} from 'typeorm';
import { Faculty } from '../../faculty/entities/faculty.entity';
import { WorkshopDay } from './workshop-day.entity';
import { WorkshopGroupDiscount } from './workshop-group-discount.entity';

export enum WorkshopDeliveryMode {
  IN_PERSON = 'in_person',
  ONLINE = 'online',
}

export enum WorkshopStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
}

@Entity('workshops')
export class Workshop {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 220 })
  title: string;

  @Column({ type: 'text', nullable: true })
  shortBlurb?: string;

  @Column({ type: 'enum', enum: WorkshopDeliveryMode })
  deliveryMode: WorkshopDeliveryMode;

  @Index()
  @Column({ type: 'enum', enum: WorkshopStatus, default: WorkshopStatus.DRAFT })
  status: WorkshopStatus;

  // cover image url
  @Column({ type: 'text', nullable: true })
  coverImageUrl?: string;

  // syllabus/details
  @Column({ type: 'text', nullable: true })
  learningObjectives?: string; // store as HTML/text from editor

  @Column({ type: 'boolean', default: false })
  offersCmeCredits: boolean;

  // location - array for multiple facilities or ["online"] for online workshops
  @Index()
  @Column({ type: 'simple-array' })
  facilityIds: string[];

  // Online workshop specific fields
  @Column({ type: 'varchar', length: 100, nullable: true })
  webinarPlatform?: string; // e.g., "Zoom", "Teams", "Google Meet"

  @Column({ type: 'text', nullable: true })
  meetingLink?: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  meetingPassword?: string;

  @Column({ type: 'boolean', default: false })
  autoRecordSession: boolean;

  // inventory
  @Column({ type: 'int' })
  capacity: number;

  @Column({ type: 'int' })
  alertAt: number;

  // pricing
  @Column({ type: 'numeric', precision: 12, scale: 2 })
  standardBaseRate: string;

  @Column({ type: 'boolean', default: false })
  groupDiscountEnabled: boolean;

  // relations
  @OneToMany(() => WorkshopDay, (d) => d.workshop, {
    cascade: true,
    eager: true,
  })
  days: WorkshopDay[];

  @OneToMany(() => WorkshopGroupDiscount, (g) => g.workshop, {
    cascade: true,
    eager: true,
  })
  groupDiscounts: WorkshopGroupDiscount[];

  // faculty assignment
  @ManyToMany(() => Faculty, { eager: true })
  @JoinTable({
    name: 'workshop_faculty',
    joinColumn: { name: 'workshopId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'facultyId', referencedColumnName: 'id' },
  })
  faculty: Faculty[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
