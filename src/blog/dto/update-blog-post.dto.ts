import {
    IsString,
    IsOptional,
    IsEnum,
    IsBoolean,
    IsArray,
    IsUUID,
    IsDateString,
    MaxLength,
} from "class-validator";
import { PublishingStatus } from "../entities/blog-post.entity";

export class UpdateBlogPostDto {
    @IsOptional()
    @IsString()
    @MaxLength(300)
    title?: string;

    @IsOptional()
    @IsString()
    content?: string;

    @IsOptional()
    @IsString()
    coverImageUrl?: string;

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

    // ── Relation IDs ──

    @IsOptional()
    @IsArray()
    @IsUUID("4", { each: true })
    authorIds?: string[];

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
