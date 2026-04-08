import { Body, Controller, Get, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { OrdersService } from './orders.service';
import { PublicOrderSummaryRequestDto } from './dto/public-order-summary.dto';
import { ShippingAddressDto } from './dto/shipping-address.dto';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';

@Controller('public/orders')
export class PublicOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get('student/recent-product-order')
  @UseGuards(AuthGuard('jwt'))
  getMyRecentProductOrder(@Req() req: AuthenticatedRequest) {
    return this.ordersService.getMyRecentProductOrder(req.user.id);
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
