import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ProductTagsController } from "./product-tags.controller";
import { ProductTagsService } from "./product-tags.service";
import { ProductTag } from "./entities/product-tag.entity";
import { RolesGuard } from "../auth/guards/roles.guard";
import { User } from "../users/entities/user.entity";

@Module({
    imports: [TypeOrmModule.forFeature([ProductTag, User])],
    controllers: [ProductTagsController],
    providers: [ProductTagsService, RolesGuard],
    exports: [ProductTagsService],
})
export class ProductTagsModule { }
