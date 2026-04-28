import { IsDateString, IsOptional, IsNumber, Min, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class AnalyticsQueryDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 10;
}

export class RevenueChartQueryDto extends AnalyticsQueryDto {
  @IsOptional()
  @IsIn(['week', 'month', 'year', 'life-time'])
  groupBy?: 'week' | 'month' | 'year' | 'life-time' = 'week';
}

export class TopProductsQueryDto extends AnalyticsQueryDto {
  @IsOptional()
  category?: string;
}

export class PopularCoursesQueryDto extends AnalyticsQueryDto {
  @IsOptional()
  type?: string;
}
