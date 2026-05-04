import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateFacilityDto {
  @IsString()
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  roomNumber: string;

  @IsString()
  @MaxLength(400)
  physicalAddress: string;

  @IsInt()
  @IsOptional()
  capacity: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @MinLength(0)
  notes?: string;
}
