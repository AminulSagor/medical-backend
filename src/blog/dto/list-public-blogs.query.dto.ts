import { IsOptional, IsInt, Min, IsString } from "class-validator";
import { Type } from "class-transformer";

export class ListPublicBlogsQueryDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number = 1;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    limit?: number = 10;

    @IsOptional()
    @IsString()
    search?: string;

    @IsOptional()
    @IsString()
    categoryId?: string;

    @IsOptional()
    @IsString()
    sortBy?: 'latest' | 'oldest' | 'featured';
}
