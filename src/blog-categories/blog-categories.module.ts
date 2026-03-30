import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { BlogCategoriesController } from "./blog-categories.controller";
import { BlogCategoriesService } from "./blog-categories.service";
import { BlogCategory } from "./entities/blog-category.entity";
import { RolesGuard } from "../auth/guards/roles.guard";
import { User } from "../users/entities/user.entity";

@Module({
    imports: [TypeOrmModule.forFeature([BlogCategory, User])],
    controllers: [BlogCategoriesController],
    providers: [BlogCategoriesService, RolesGuard],
    exports: [TypeOrmModule, BlogCategoriesService],
})
export class BlogCategoriesModule { }
