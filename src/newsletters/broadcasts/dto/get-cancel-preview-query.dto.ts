import { IsOptional, IsString, MaxLength } from 'class-validator';

export class GetCancelPreviewQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  locale?: string;
}
