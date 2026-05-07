import {
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Column,
} from 'typeorm';

@Entity('newsletter_course_announcement_recipients')
@Index(['broadcastId', 'userId'], { unique: true })
export class NewsletterCourseAnnouncementRecipient {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  broadcastId: string;

  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ type: 'uuid', nullable: true })
  attendeeId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
