// import { IsEnum, IsOptional } from 'class-validator';
// import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
// import { NewsletterUnsubscribeRequestStatus } from 'src/common/enums/newsletter-constants.enum';

// export class ListUnsubscribeRequestsQueryDto extends PaginationQueryDto {
//   @IsOptional()
//   @IsEnum(NewsletterUnsubscribeRequestStatus)
//   status?: NewsletterUnsubscribeRequestStatus;
// }

import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class ListUnsubscribeRequestsQueryDto {
  @IsOptional()
  @IsIn(['requested', 'unsubscribed'])
  tab?: 'requested' | 'unsubscribed';

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
