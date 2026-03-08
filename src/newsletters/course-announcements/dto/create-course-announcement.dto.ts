import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';
import {
  CourseAnnouncementPriority,
  CourseAnnouncementRecipientMode,
} from 'src/common/enums/newsletter-constants.enum';

export class CreateCourseAnnouncementDto {
  @IsUUID()
  workshopId: string;

  @IsEnum(CourseAnnouncementPriority)
  priority: CourseAnnouncementPriority;

  @IsEnum(CourseAnnouncementRecipientMode)
  recipientMode: CourseAnnouncementRecipientMode;

  @IsString()
  @Length(3, 160)
  subjectLine: string;

  @IsString()
  @Length(1, 200000)
  messageBodyHtml: string;

  @IsOptional()
  @IsString()
  @Length(0, 200000)
  messageBodyText?: string;

  @IsOptional()
  @IsBoolean()
  pushToStudentPanel?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(5000)
  @IsUUID('4', { each: true })
  recipientIds?: string[];
}
