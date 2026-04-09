import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from 'src/users/entities/user.entity';

export enum NotificationPriority {
  CRITICAL = 'Critical',
  HIGH = 'High',
  ROUTINE = 'Routine',
}

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  title: string;

  @Column('text')
  message: string;

  @Column()
  category: string; // e.g., 'refund_request', 'system_update', 'new_order'

  @Column()
  type: string;

  @Column({
    type: 'enum',
    enum: NotificationPriority,
    default: NotificationPriority.ROUTINE,
  })
  priority: NotificationPriority;

  @Column({ default: false })
  isRead: boolean;

  @Column({ type: 'timestamp', nullable: true })
  readAt: Date;

  @Column({ nullable: true })
  icon: string;

  @Column({ nullable: true })
  resourceType: string; // e.g., 'Order', 'Workshop'

  @Column({ nullable: true })
  resourceId: string;

  @Column({ nullable: true })
  actionRoute: string;

  @CreateDateColumn()
  createdAt: Date;
}
