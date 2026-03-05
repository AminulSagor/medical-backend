import {
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { NewsletterFrequencyType } from 'src/common/enums/newsletter-constants.enum';

const ISO_DATE_TIME_REGEX =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

export class ScheduleBroadcastDto {
  @IsEnum(NewsletterFrequencyType)
  frequencyType: NewsletterFrequencyType;

  @Matches(ISO_DATE_TIME_REGEX, {
    message: 'scheduledAtUtc must be ISO UTC datetime',
  })
  scheduledAtUtc: string;

  @IsString()
  @MaxLength(64)
  timezone: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  cadenceAnchorLabel?: string;
}
