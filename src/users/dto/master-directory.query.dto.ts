import { IsOptional, IsString, IsInt, Min, IsEnum } from "class-validator";
import { Type } from "class-transformer";
import { UserRole, UserStatus } from "../entities/user.entity";

export class MasterDirectoryQueryDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number = 1;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    limit?: number = 20;

    @IsOptional()
    @IsString()
    search?: string;

    @IsOptional()
    @IsEnum(UserRole)
    role?: UserRole;

    @IsOptional()
    @IsEnum(UserStatus)
    status?: UserStatus;

    @IsOptional()
    @IsString()
    sortBy?: 'name' | 'email' | 'joinedDate' | 'courses';

    @IsOptional()
    @IsString()
    sortOrder?: 'asc' | 'desc';
}
