import {
    IsString,
    IsOptional,
    IsBoolean,
    MaxLength,
} from "class-validator";

export class UpdateBlogCategoryDto {
    @IsOptional()
    @IsString()
    @MaxLength(120)
    name?: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}
