import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class ListTransmissionRecipientsQueryDto {
  @IsOptional()
  @IsIn(['all', 'opened', 'clicked', 'bounced'])
  tab?: 'all' | 'opened' | 'clicked' | 'bounced';

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
