import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateSubscriberProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(180)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  clinicalRole?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  institution?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  acquisitionSource?: string;
}
