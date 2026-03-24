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
  weeklyReleaseDay: WeekDay | null;

  @Column({ type: 'time', nullable: true })
  weeklyReleaseTime: string | null; // HH:mm:ss

  @Column({ type: 'boolean', default: true })
  monthlyEnabled: boolean;

  @Column({ type: 'date', nullable: true })
  monthlyCycleStartDate: string | null;

  @Column({ type: 'smallint', nullable: true })
  monthlyDayOfMonth: number | null; // 1..31

  @Column({ type: 'time', nullable: true })
  monthlyReleaseTime: string | null; // HH:mm:ss

  @Column({ type: 'varchar', length: 64, default: 'America/Chicago' })
  timezone: string;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ type: 'uuid', nullable: true })
  updatedByAdminId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
