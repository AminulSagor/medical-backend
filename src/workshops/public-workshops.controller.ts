import { Body, Controller, Get, Post, Param, Query, UseGuards, Request } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { WorkshopsService } from "./workshops.service";
import { PublicListWorkshopsQueryDto } from "./dto/public-list-workshops.query.dto";
import { CreateReservationDto } from "./dto/create-reservation.dto";
import { CheckoutOrderSummaryDto } from "./dto/checkout-order-summary.dto";
import { CreateWorkshopPaymentSessionDto } from "./dto/create-workshop-payment-session.dto";
import { VerifyWorkshopPaymentDto } from "./dto/verify-workshop-payment.dto";

@Controller("workshops")
export class PublicWorkshopsController {
    constructor(private readonly service: WorkshopsService) { }

    @Get("student/enrolled-workshops")
    @UseGuards(AuthGuard("jwt"))
    getMyEnrolledWorkshops(@Request() req: any) {
        const userId = req.user.id;
        return this.service.getMyEnrolledWorkshops(userId);
    }

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

    @Post("checkout/payment-session")
    @UseGuards(AuthGuard("jwt"))
    createPaymentSession(@Request() req: any, @Body() dto: CreateWorkshopPaymentSessionDto) {
        const userId = req.user.id;
        return this.service.createPaymentSession(userId, dto);
    }

    @Post("checkout/payment-verify")
    @UseGuards(AuthGuard("jwt"))
    verifyPayment(@Request() req: any, @Body() dto: VerifyWorkshopPaymentDto) {
        const userId = req.user.id;
        return this.service.verifyPayment(userId, dto);
    }

    @Post("reservations")
    @UseGuards(AuthGuard("jwt"))
    createReservation(@Request() req: any, @Body() dto: CreateReservationDto) {
        const userId = req.user.id;
        return this.service.createReservation(userId, dto);
    }
}
