import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Roles } from "../auth/decorators/roles.decorator";
import { RolesGuard } from "../auth/guards/roles.guard";
import { CreateWorkshopDto } from "./dto/create-workshop.dto";
import { ListWorkshopsQueryDto } from "./dto/list-workshops.query.dto";
import { WorkshopsService } from "./workshops.service";

@Controller("admin/workshops")
export class WorkshopsController {
    constructor(private readonly service: WorkshopsService) { }

    @Post()
    @UseGuards(AuthGuard("jwt"), RolesGuard)
    @Roles("admin")
    create(@Body() dto: CreateWorkshopDto) {
        return this.service.create(dto);
    }

    @Get()
    @UseGuards(AuthGuard("jwt"), RolesGuard)
    @Roles("admin")
    list(@Query() query: ListWorkshopsQueryDto) {
        return this.service.list(query);
    }
}