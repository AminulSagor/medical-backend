import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Entity('notification_preferences')
@Unique(['userId', 'preferenceKey'])
export class NotificationPreference {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  sectionKey: string; // 'clinical_operations', 'shop_inventory', 'system_security'

  @Column()
  preferenceKey: string; // e.g., 'refund_requests'

  @Column({ default: true })
  inAppEnabled: boolean;

  @Column({ default: true })
  emailEnabled: boolean;

  @Column({ nullable: true })
  frequency: string; // 'Immediate', 'Daily Digest', 'Weekly Digest'

  @UpdateDateColumn()
  updatedAt: Date;
}
