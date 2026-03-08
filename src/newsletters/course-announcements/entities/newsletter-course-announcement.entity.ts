import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { NewsletterBroadcast } from '../../broadcasts/entities/newsletter-broadcast.entity';
import {
  CourseAnnouncementPriority,
  CourseAnnouncementRecipientMode,
} from 'src/common/enums/newsletter-constants.enum';

@Entity('newsletter_course_announcements')
export class NewsletterCourseAnnouncement {
  @PrimaryColumn('uuid')
  broadcastId: string;

  @OneToOne(() => NewsletterBroadcast, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'broadcastId' })
  broadcast: NewsletterBroadcast;

  @Column('uuid')
  workshopId: string;

  @Column({
    type: 'enum',
    enum: CourseAnnouncementPriority,
  })
  priority: CourseAnnouncementPriority;

  @Column({
    type: 'enum',
    enum: CourseAnnouncementRecipientMode,
  })
  recipientMode: CourseAnnouncementRecipientMode;

  @Column({ type: 'boolean', default: false })
  pushToStudentPanel: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
