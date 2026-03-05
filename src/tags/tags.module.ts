import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { TagsController } from "./tags.controller";
import { TagsService } from "./tags.service";
import { Tag } from "./entities/tag.entity";
import { RolesGuard } from "../auth/guards/roles.guard";
import { User } from "../users/entities/user.entity";

@Module({
    imports: [TypeOrmModule.forFeature([Tag, User])],
    controllers: [TagsController],
    providers: [TagsService, RolesGuard],
})
export class TagsModule { }
