import { NewsletterChannelType } from 'src/common/enums/newsletter-constants.enum';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

@Entity('newsletter_audience_segments')
@Unique('uq_newsletter_audience_segments_channel_type_name', [
  'channelType',
  'name',
])
export class NewsletterAudienceSegment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: NewsletterChannelType,
    enumName: 'newsletter_channel_type_enum',
  })
  @Index()
  channelType: NewsletterChannelType;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  code: string | null; // e.g. ALL_SUBSCRIBERS (optional)

  @Column({ type: 'varchar', length: 250, nullable: true })
  description: string | null;

  @Column({ type: 'boolean', default: false })
  isSystem: boolean;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'uuid', nullable: true })
  createdByAdminId: string | null;

  @Column({ type: 'uuid', nullable: true })
  updatedByAdminId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
