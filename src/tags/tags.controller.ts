import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Roles } from "../auth/decorators/roles.decorator";
import { RolesGuard } from "../auth/guards/roles.guard";
import { TagsService } from "./tags.service";
import { CreateTagDto } from "./dto/create-tag.dto";
import { BulkCreateTagDto } from "./dto/bulk-create-tag.dto";

@Controller("admin/tags")
export class TagsController {
    constructor(private readonly tagsService: TagsService) { }

    @Get()
    @UseGuards(AuthGuard("jwt"), RolesGuard)
    @Roles("admin")
    list() {
        return this.tagsService.list();
    }

    @Post()
    @UseGuards(AuthGuard("jwt"), RolesGuard)
    @Roles("admin")
    create(@Body() dto: CreateTagDto) {
        return this.tagsService.create(dto);
    }

    @Post("bulk")
    @UseGuards(AuthGuard("jwt"), RolesGuard)
    @Roles("admin")
    bulkCreate(@Body() dto: BulkCreateTagDto) {
        return this.tagsService.bulkCreate(dto);
    }
}
