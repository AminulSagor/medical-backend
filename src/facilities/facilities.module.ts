import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Facility } from "./entities/facility.entity";
import { FacilitiesController } from "./facilities.controller";
import { FacilitiesService } from "./facilities.service";

@Module({
    imports: [TypeOrmModule.forFeature([Facility])],
    controllers: [FacilitiesController],
    providers: [FacilitiesService],
    exports: [TypeOrmModule],
})
export class FacilitiesModule { }