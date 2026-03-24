import {
    IsString,
    IsOptional,
    IsBoolean,
    MaxLength,
} from "class-validator";

export class CreateBlogCategoryDto {
    @IsString()
    @MaxLength(120)
    name: string;

    @IsOptional()
    @IsString()
    description?: string;

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}
