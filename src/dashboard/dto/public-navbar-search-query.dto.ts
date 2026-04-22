import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class PublicNavbarSearchQueryDto {
  @IsString()
  @Transform(({ value }) => String(value ?? '').trim())
  q: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  limitPerType?: number = 4;
}
