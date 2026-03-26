import { IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateFacilityDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    facilityName: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(50)
    roomNumber: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(400)
    physicalAddress: string;

    @IsOptional()
    @IsString()
    capacityNotes?: string;
}