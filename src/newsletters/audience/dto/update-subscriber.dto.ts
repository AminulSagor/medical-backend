import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { NewsletterSubscriberStatus } from 'src/common/enums/newsletter-constants.enum';

export class UpdateSubscriberDto {
  @IsOptional()
  @IsString()
  @MaxLength(180)
  fullName?: string;

  @IsOptional()
  @IsEnum(NewsletterSubscriberStatus)
  status?: NewsletterSubscriberStatus;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  unsubscribeReason?: string;
}
