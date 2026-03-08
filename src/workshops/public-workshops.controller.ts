import { Body, Controller, Get, Post, Param, Query, UseGuards, Request } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { WorkshopsService } from "./workshops.service";
import { PublicListWorkshopsQueryDto } from "./dto/public-list-workshops.query.dto";
import { CreateReservationDto } from "./dto/create-reservation.dto";
import { CheckoutOrderSummaryDto } from "./dto/checkout-order-summary.dto";

@Controller("workshops")
export class PublicWorkshopsController {
    constructor(private readonly service: WorkshopsService) { }

    @Get()
    listPublic(@Query() query: PublicListWorkshopsQueryDto) {
        return this.service.listPublic(query);
    }

    @Get(":id")
    getWorkshopById(@Param("id") id: string) {
        return this.service.getPublicWorkshopById(id);
    }

    @Post("checkout/order-summary")
    @UseGuards(AuthGuard("jwt"))
    createOrderSummary(@Request() req: any, @Body() dto: CheckoutOrderSummaryDto) {
        const userId = req.user.id;
        return this.service.createOrderSummary(userId, dto);
    }

    @Get("checkout/order-summary/:id")
    @UseGuards(AuthGuard("jwt"))
    getOrderSummary(@Request() req: any, @Param("id") id: string) {
        const userId = req.user.id;
        return this.service.getOrderSummary(userId, id);
    }

    @Post("reservations")
    @UseGuards(AuthGuard("jwt"))
    createReservation(@Request() req: any, @Body() dto: CreateReservationDto) {
        const userId = req.user.id;
        return this.service.createReservation(userId, dto);
    }
}
