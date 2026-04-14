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
import { Workshop } from './workshop.entity';
import { User } from 'src/users/entities/user.entity';
import { CourseProgressStatus } from './course-progress-status.enum';

@Entity('workshop_enrollments')
@Index(['workshopId', 'userId'], { unique: true })
export class WorkshopEnrollment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  workshopId: string;

  @Column('uuid')
  userId: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({
    type: 'enum',
    enum: CourseProgressStatus,
    default: CourseProgressStatus.NOT_STARTED,
  })
  courseProgressStatus: CourseProgressStatus;

  @Column({ type: 'timestamptz', nullable: true })
  courseStartedAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  courseCompletedAt?: Date;

  @Column({ type: 'boolean', default: false })
  cmeCreditsAwarded: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  cmeCreditsAwardedAt?: Date;

  @ManyToOne(() => Workshop, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workshopId' })
  workshop: Workshop;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
