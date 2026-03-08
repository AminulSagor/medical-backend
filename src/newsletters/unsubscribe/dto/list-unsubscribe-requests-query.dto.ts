import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { NewsletterUnsubscribeRequestStatus } from 'src/common/enums/newsletter-constants.enum';

export class ListUnsubscribeRequestsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(NewsletterUnsubscribeRequestStatus)
  status?: NewsletterUnsubscribeRequestStatus;
}
