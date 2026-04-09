import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { OrdersService } from './orders.service';
import { PublicOrderSummaryRequestDto } from './dto/public-order-summary.dto';
import { ShippingAddressDto } from './dto/shipping-address.dto';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';
import { ListMyOrderHistoryQueryDto } from './dto/list-my-order-history.query.dto';

@Controller('public/orders')
export class PublicOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get('student/recent-product-order')
  @UseGuards(AuthGuard('jwt'))
  getMyRecentProductOrder(@Req() req: AuthenticatedRequest) {
    return this.ordersService.getMyRecentProductOrder(req.user.id);
  }

  @Get('history/summary')
  @UseGuards(AuthGuard('jwt'))
  getMyOrderHistorySummary(@Req() req: AuthenticatedRequest) {
    return this.ordersService.getMyOrderHistorySummary(req.user.id);
  }

  @Get('history')
  @UseGuards(AuthGuard('jwt'))
  getMyPastOrders(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListMyOrderHistoryQueryDto,
  ) {
    return this.ordersService.getMyPastOrders(req.user.id, query);
  }

  @Get('history/breakdown/:orderNumber')
  @UseGuards(AuthGuard('jwt'))
  getMyOrderBreakdown(
    @Req() req: AuthenticatedRequest,
    @Param('orderNumber') orderNumber: string,
  ) {
    return this.ordersService.getMyOrderBreakdownByOrderNumber(
      req.user.id,
      orderNumber,
    );
  }

  @Get('history/:id')
  @UseGuards(AuthGuard('jwt'))
  getMyPastOrderDetails(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.ordersService.getMyPastOrderDetails(req.user.id, id);
  }

  @Post('summary')
  getOrderSummary(@Body() dto: PublicOrderSummaryRequestDto) {
    return this.ordersService.getPublicOrderSummary(dto);
  }

  @Get('shipping-address')
  @UseGuards(AuthGuard('jwt'))
  getMyShippingAddress(@Req() req: AuthenticatedRequest) {
    return this.ordersService.getMyShippingAddress(req.user.id);
  }

  @Patch('shipping-address')
  @UseGuards(AuthGuard('jwt'))
  updateMyShippingAddress(
    @Req() req: AuthenticatedRequest,
    @Body() dto: ShippingAddressDto,
  ) {
    return this.ordersService.updateMyShippingAddress(req.user.id, dto);
  }

  @Post('checkout/stripe-session')
  @UseGuards(AuthGuard('jwt'))
  createStripeCheckoutSession(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateCheckoutSessionDto,
  ) {
    return this.ordersService.createStripeCheckoutSession(req.user.id, dto);
  }
}
