import { IsOptional, IsString, IsNumberString, IsInt, Min, IsArray } from "class-validator";
import { Type } from "class-transformer";

export class ListProductsPublicQueryDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number = 1;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    limit?: number = 12;

    @IsOptional()
    @IsString()
    search?: string;

    // Filter by category ID(s)
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    categoryIds?: string[];

    // Filter by brand(s)
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    brands?: string[];

    // Price range filters
    @IsOptional()
    @IsNumberString()
    minPrice?: string;

    @IsOptional()
    @IsNumberString()
    maxPrice?: string;

    // Sort options
    @IsOptional()
    @IsString()
    sortBy?: 'price-asc' | 'price-desc' | 'name-asc' | 'name-desc' | 'newest';
}
