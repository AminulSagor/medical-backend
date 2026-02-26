import { IsEmail, IsNotEmpty, IsOptional, IsString, Length } from "class-validator";

export class CreateFacultyDto {
    @IsString()
    @IsNotEmpty()
    firstName: string;

    @IsString()
    @IsNotEmpty()
    lastName: string;

    @IsString()
    @IsNotEmpty()
    phoneNumber: string;

    @IsEmail()
    email: string;

    @IsOptional()
    @IsString()
    imageUrl?: string;

    @IsOptional()
    @IsString()
    primaryClinicalRole?: string;

    @IsOptional()
    @IsString()
    medicalDesignation?: string;

    @IsOptional()
    @IsString()
    institutionOrHospital?: string;

    @IsString()
    @Length(10, 10)
    npiNumber: string;

    @IsString()
    assignedRole: string;
}
