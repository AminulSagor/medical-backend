import { IsOptional, IsString, MaxLength } from 'class-validator';

export class GetScheduleSuccessQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  locale?: string;
}
