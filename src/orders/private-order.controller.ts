import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PrivateOrderService } from './private-order.service';
import type { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';

@Controller('users/private/orders')
@UseGuards(AuthGuard('jwt'))
export class PrivateOrderController {
  constructor(private readonly privateOrderService: PrivateOrderService) {}

  @Get('summary')
  getOrderSummary(@Req() req: AuthenticatedRequest) {
    // Note: Assuming req.user has 'medicalEmail' or 'email'. Adjust according to your JWT payload.
    const userEmail = req.user.medicalEmail;
    return this.privateOrderService.getOrderSummary(userEmail);
  }

  @Get()
  getOrderHistory(@Req() req: AuthenticatedRequest, @Query() query: any) {
    const userEmail = req.user.medicalEmail;
    return this.privateOrderService.getOrderHistory(userEmail, query);
  }

  @Get(':orderId')
  getOrderDetails(
    @Req() req: AuthenticatedRequest,
    @Param('orderId') orderId: string,
  ) {
    const userEmail = req.user.medicalEmail;
    return this.privateOrderService.getOrderDetails(userEmail, orderId);
  }
}
