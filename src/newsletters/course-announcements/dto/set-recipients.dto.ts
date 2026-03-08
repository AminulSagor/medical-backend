import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { CourseAnnouncementRecipientMode } from 'src/common/enums/newsletter-constants.enum';

export class SetCourseRecipientsDto {
  @IsEnum(CourseAnnouncementRecipientMode)
  recipientMode: CourseAnnouncementRecipientMode;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(5000)
  @IsUUID('4', { each: true })
  recipientIds?: string[];
}
