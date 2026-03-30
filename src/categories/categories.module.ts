import { Module } from "@nestjs/common";
import { CategoriesController } from "./categories.controller";
import { RolesGuard } from "../auth/guards/roles.guard";
import { BlogCategoriesModule } from "../blog-categories/blog-categories.module";

@Module({
    imports: [BlogCategoriesModule],
    controllers: [CategoriesController],
    providers: [RolesGuard],
})
export class CategoriesModule { }
