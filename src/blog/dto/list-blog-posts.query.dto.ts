import { IsOptional, IsEnum, IsString, IsInt, Min } from "class-validator";
import { Type } from "class-transformer";
import { PublishingStatus } from "../entities/blog-post.entity";

export class ListBlogPostsQueryDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    limit?: number;

    @IsOptional()
    @IsEnum(PublishingStatus)
    status?: PublishingStatus;

    @IsOptional()
    @IsString()
    search?: string;

    @IsOptional()
    @IsString()
    categoryId?: string;

    @IsOptional()
    @IsString()
    tagId?: string;
}
