import { IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class UpdateFacilityDto {
    @IsOptional()
    @IsString()
    @MaxLength(200)
    name?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    roomNumber?: string;

    @IsOptional()
    @IsString()
    @MaxLength(400)
    physicalAddress?: string;

    @IsOptional()
    @IsInt()
    @Min(1)
    capacity?: number;

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    notes?: string;
}
