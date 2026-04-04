import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('expert_reviews')
export class ExpertReview {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int' })
  rating: number;

  @Column({ type: 'text' })
  reviewMessage: string;

  @Column({ type: 'varchar', length: 120 })
  reviewerName: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reviewerProfileImg: string | null;

  @Column({ type: 'varchar', length: 120 })
  reviewerDesignation: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
