import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { BlogCategory } from "../blog-categories/entities/blog-category.entity";
import { CategoriesController } from "./categories.controller";
import { CategoriesService } from "./categories.service";
import { RolesGuard } from "../auth/guards/roles.guard";
import { User } from "../users/entities/user.entity";

@Module({
    imports: [TypeOrmModule.forFeature([BlogCategory, User])],
    controllers: [CategoriesController],
    providers: [CategoriesService, RolesGuard],
})
export class CategoriesModule { }
