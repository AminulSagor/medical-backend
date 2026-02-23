import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Category } from "./entities/category.entity";
import { CategoriesController } from "./categories.controller";
import { CategoriesService } from "./categories.service";
import { RolesGuard } from "../auth/guards/roles.guard";
import { User } from "../users/entities/user.entity";

@Module({
    imports: [TypeOrmModule.forFeature([Category, User])],
    controllers: [CategoriesController],
    providers: [CategoriesService, RolesGuard],
})
export class CategoriesModule { }
