import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { BlogController } from "./blog.controller";
import { BlogService } from "./blog.service";
import { BlogSchedulerService } from "./blog-scheduler.service";
import { BlogPost } from "./entities/blog-post.entity";
import { BlogPostSeo } from "./entities/blog-post-seo.entity";
import { User } from "../users/entities/user.entity";
import { BlogCategory } from "../blog-categories/entities/blog-category.entity";
import { Tag } from "../tags/entities/tag.entity";
import { RolesGuard } from "../auth/guards/roles.guard";

@Module({
    imports: [
        TypeOrmModule.forFeature([BlogPost, BlogPostSeo, User, BlogCategory, Tag]),
    ],
    controllers: [BlogController],
    providers: [BlogService, BlogSchedulerService, RolesGuard],
})
export class BlogModule { }
