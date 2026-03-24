import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { NewsletterSubscriberStatus } from 'src/common/enums/newsletter-constants.enum';

export class ListSubscribersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsEnum(NewsletterSubscriberStatus)
  status?: NewsletterSubscriberStatus;
}
