import { Body, Controller, Get, Post, Put, Param, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Roles } from "../auth/decorators/roles.decorator";
import { RolesGuard } from "../auth/guards/roles.guard";
import { CreateWorkshopDto } from "./dto/create-workshop.dto";
import { UpdateWorkshopDto } from "./dto/update-workshop.dto";
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

    @Put(":id")
    @UseGuards(AuthGuard("jwt"), RolesGuard)
    @Roles("admin")
    update(@Param("id") id: string, @Body() dto: UpdateWorkshopDto) {
        return this.service.update(id, dto);
    }

    @Get()
    @UseGuards(AuthGuard("jwt"), RolesGuard)
    @Roles("admin")
    list(@Query() query: ListWorkshopsQueryDto) {
        return this.service.list(query);
    }
}