import { IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class SearchArticleSourcesQueryDto extends PaginationQueryDto {
  @IsString()
  @MaxLength(120)
  search: string;
}
