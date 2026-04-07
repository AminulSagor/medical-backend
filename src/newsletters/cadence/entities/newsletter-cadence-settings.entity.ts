import {
  NewsletterChannelType,
  WeekDay,
} from 'src/common/enums/newsletter-constants.enum';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Unique,
  VersionColumn,
} from 'typeorm';

@Entity('newsletter_cadence_settings')
@Unique('uq_newsletter_cadence_settings_channel_type', ['channelType'])
export class NewsletterCadenceSetting {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: NewsletterChannelType,
    enumName: 'newsletter_channel_type_enum',
  })
  @Index()
  channelType: NewsletterChannelType;

  // --- Global Settings ---
  @Column({ type: 'varchar', length: 100, default: 'America/Chicago' })
  timezone: string;

  // --- Weekly Settings ---
  @Column({ type: 'boolean', default: true })
  weeklyEnabled: boolean;

  @Column({ type: 'date', nullable: true })
  weeklyCycleStartDate: string | null; // YYYY-MM-DD

  @Column({
    type: 'enum',
    enum: WeekDay,
    enumName: 'newsletter_week_day_enum',
    nullable: true,
  })
  weeklyReleaseDay: WeekDay | null; // e.g., 'MONDAY'

  @Column({ type: 'time', nullable: true })
  weeklyReleaseTime: string | null; // HH:mm:ss

  // --- Monthly Settings ---
  @Column({ type: 'boolean', default: true })
  monthlyEnabled: boolean;

  @Column({ type: 'date', nullable: true })
  monthlyCycleStartDate: string | null;

  @Column({ type: 'smallint', nullable: true })
  monthlyDayOfMonth: number | null; // 1..31

  @Column({ type: 'time', nullable: true })
  monthlyReleaseTime: string | null; // HH:mm:ss

  // --- Tracking & Versioning ---
  @VersionColumn()
  version: number; // Automatically increments on save to track schedule staleness

  @Column({ type: 'uuid', nullable: true })
  updatedByAdminId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
