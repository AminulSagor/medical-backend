import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';
import { SessionStatusParamsDto } from './dto/session-status.params.dto';
import { PaymentsService } from 'src/payments/payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('checkout-session')
  @UseGuards(AuthGuard('jwt'))
  createCheckoutSession(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateCheckoutSessionDto,
  ) {
    return this.paymentsService.createCheckoutSession(req.user.id, dto);
  }

  @Post('webhooks/stripe')
  @HttpCode(200)
  handleStripeWebhook(
    @Req() req: any,
    @Headers('stripe-signature') signature: string | undefined,
  ) {
    return this.paymentsService.handleStripeWebhook(req.rawBody, signature);
  }

  @Get('session-status/:sessionId')
  @UseGuards(AuthGuard('jwt'))
  getSessionStatus(
    @Req() req: AuthenticatedRequest,
    @Param() params: SessionStatusParamsDto,
  ) {
    return this.paymentsService.getSessionStatus(req.user.id, params.sessionId);
  }
}
