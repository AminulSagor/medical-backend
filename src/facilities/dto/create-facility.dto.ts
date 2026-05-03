import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateFacilityDto {
  @IsString()
  @MaxLength(200)
  name: string;

  @IsString()
  @MaxLength(100)
  roomNumber: string;

  @IsString()
  @MaxLength(400)
  physicalAddress: string;

  @IsInt()
  @Min(1)
  capacity: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
