import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Roles } from "../auth/decorators/roles.decorator";
import { RolesGuard } from "../auth/guards/roles.guard";
import { CreateFacilityDto } from "./dto/create-facility.dto";
import { UpdateFacilityDto } from "./dto/update-facility.dto";
import { FacilitiesService } from "./facilities.service";

@Controller("admin/facilities")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles("admin")
export class FacilitiesController {
    constructor(private readonly service: FacilitiesService) { }

    @Post()
    create(@Body() dto: CreateFacilityDto) {
        return this.service.create(dto);
    }

    @Patch(":id")
    update(@Param("id") id: string, @Body() dto: UpdateFacilityDto) {
        return this.service.update(id, dto);
    }

    @Get()
    list() {
        return this.service.listActive();
    }
}