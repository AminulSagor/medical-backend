import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

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

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
