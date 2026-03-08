import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { WorkshopsController } from "./workshops.controller";
import { PublicWorkshopsController } from "./public-workshops.controller";
import { WorkshopsService } from "./workshops.service";
import { Workshop } from "./entities/workshop.entity";
import { WorkshopDay } from "./entities/workshop-day.entity";
import { WorkshopSegment } from "./entities/workshop-segment.entity";
import { WorkshopGroupDiscount } from "./entities/workshop-group-discount.entity";
import { WorkshopReservation } from "./entities/workshop-reservation.entity";
import { WorkshopAttendee } from "./entities/workshop-attendee.entity";
import { WorkshopOrderSummary } from "./entities/workshop-order-summary.entity";
import { WorkshopOrderAttendee } from "./entities/workshop-order-attendee.entity";
import { Facility } from "../facilities/entities/facility.entity";
import { Faculty } from "../faculty/entities/faculty.entity";
import { AuthModule } from "../auth/auth.module";
import { UsersModule } from "../users/users.module";


@Module({
    imports: [
        AuthModule,
        UsersModule, // ✅ provides/export UserRepository via TypeOrmModule export
        TypeOrmModule.forFeature([
            Workshop,
            WorkshopDay,
            WorkshopSegment,
            WorkshopGroupDiscount,
            WorkshopReservation,
            WorkshopAttendee,
            WorkshopOrderSummary,
            WorkshopOrderAttendee,
            Facility,
            Faculty,
        ]),
    ],
    controllers: [WorkshopsController, PublicWorkshopsController],
    providers: [WorkshopsService],
})
export class WorkshopsModule { }
