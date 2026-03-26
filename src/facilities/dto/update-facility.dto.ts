import { IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateFacilityDto {
    @IsOptional()
    @IsString()
    @MaxLength(200)
    name?: string;

    @IsOptional()
    @IsString()
    @MaxLength(400)
    address?: string;
}
