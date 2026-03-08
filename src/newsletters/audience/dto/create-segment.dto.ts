import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSegmentDto {
  @IsString()
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
