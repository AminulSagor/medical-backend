import {
    IsString,
    IsOptional,
    IsEnum,
    IsBoolean,
    IsArray,
    IsDateString,
    MaxLength,
    IsInt,
    Min,
    IsUUID,
    ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { PublishingStatus } from "../entities/blog-post.entity";
import { BlogCoverImageDto } from "./blog-cover-image.dto";

export class CreateBlogPostDto {
    @IsString()
    @MaxLength(300)
    title: string;

    @IsString()
    content: string;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => BlogCoverImageDto)
    coverImageUrl?: BlogCoverImageDto[];

    @IsOptional()
    @IsString()
    @MaxLength(200)
    authorName?: string;

    @IsOptional()
    @IsEnum(PublishingStatus)
    publishingStatus?: PublishingStatus;

    @IsOptional()
    @IsDateString()
    scheduledPublishDate?: string;

    @IsOptional()
    @IsBoolean()
    isFeatured?: boolean;

    @IsOptional()
    @IsString()
    excerpt?: string;

    @IsOptional()
    @IsInt()
    @Min(1)
    readTimeMinutes?: number;

    // ── Relation IDs ──

    @IsOptional()
    @IsArray()
    @IsUUID("4", { each: true })
    categoryIds?: string[];

    @IsOptional()
    @IsArray()
    @IsUUID("4", { each: true })
    tagIds?: string[];

    // ── SEO ──

    @IsOptional()
    @IsString()
    @MaxLength(160)
    seoMetaTitle?: string;

    @IsOptional()
    @IsString()
    @MaxLength(320)
    seoMetaDescription?: string;
}
