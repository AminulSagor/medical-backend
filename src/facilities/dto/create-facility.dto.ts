import { IsString, MaxLength } from "class-validator";

export class CreateFacilityDto {
    @IsString()
    @MaxLength(200)
    name: string;

    @IsString()
    @MaxLength(400)
    address: string;
}