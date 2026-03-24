import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { IsIn, IsOptional } from 'class-validator';

export class SubscriberHistoryQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(['orders', 'newsletters'])
  tab?: 'orders' | 'newsletters';
}
