import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CourseAnnouncementsController } from './course-announcements.controller';
import { CourseAnnouncementsService } from './course-announcements.service';

import { NewsletterBroadcast } from '../broadcasts/entities/newsletter-broadcast.entity';
import { NewsletterBroadcastCustomContent } from '../broadcasts/entities/newsletter-broadcast-custom-content.entity';
import { NewsletterBroadcastAttachment } from '../broadcasts/entities/newsletter-broadcast-attachment.entity';
import { NewsletterSubscriber } from '../audience/entities/newsletter-subscriber.entity';

import { NewsletterCourseAnnouncement } from './entities/newsletter-course-announcement.entity';
import { NewsletterCourseAnnouncementRecipient } from './entities/newsletter-course-announcement-recipient.entity';

import { Workshop } from '../../workshops/entities/workshop.entity';
import { WorkshopEnrollment } from '../../workshops/entities/workshop-enrollment.entity';
import { User } from '../../users/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      NewsletterBroadcast,
      NewsletterBroadcastCustomContent,
      NewsletterBroadcastAttachment,
      NewsletterSubscriber,

      NewsletterCourseAnnouncement,
      NewsletterCourseAnnouncementRecipient,

      Workshop,
      WorkshopEnrollment,
      User,
    ]),
  ],
  controllers: [CourseAnnouncementsController],
  providers: [CourseAnnouncementsService],
})
export class CourseAnnouncementsModule {}
