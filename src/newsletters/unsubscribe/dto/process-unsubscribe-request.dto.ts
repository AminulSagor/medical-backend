import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { NewsletterUnsubscribeRequestStatus } from 'src/common/enums/newsletter-constants.enum';

export class ProcessUnsubscribeRequestDto {
  @IsEnum(NewsletterUnsubscribeRequestStatus)
  status: NewsletterUnsubscribeRequestStatus; // PROCESSED or REJECTED

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
