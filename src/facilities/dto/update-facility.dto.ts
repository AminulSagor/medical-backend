import { IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateFacilityDto {
    @IsOptional()
    @IsString()
    @MaxLength(200)
    facilityName?: string;

    @IsOptional()
    @IsString()
    @MaxLength(50)
    roomNumber?: string;

    @IsOptional()
    @IsString()
    @MaxLength(400)
    physicalAddress?: string;

    @IsOptional()
    @IsString()
    capacityNotes?: string;
}
