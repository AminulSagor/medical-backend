import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';
import { CreateProductOrderSummaryDto } from './dto/create-product-order-summary.dto';
import { SessionStatusParamsDto } from './dto/session-status.params.dto';
import { PaymentsService } from 'src/payments/payments.service';
import type { Response } from 'express';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('product/order-summary')
  @UseGuards(AuthGuard('jwt'))
  createProductOrderSummary(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateProductOrderSummaryDto,
  ) {
    return this.paymentsService.createProductOrderSummary(req.user.id, dto);
  }

  @Get('product/order-summary/:id')
  @UseGuards(AuthGuard('jwt'))
  getProductOrderSummary(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.paymentsService.getProductOrderSummary(req.user.id, id);
  }

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

  @Get('invoices/product/:orderId/download')
  @UseGuards(AuthGuard('jwt'))
  async downloadProductInvoice(
    @Req() req: AuthenticatedRequest,
    @Param('orderId', new ParseUUIDPipe()) orderId: string,
    @Res() res: Response,
  ) {
    const pdfBuffer = await this.paymentsService.getProductInvoicePdf(
      orderId,
      req.user.id,
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="invoice-product-${orderId}.pdf"`,
    );

    return res.send(pdfBuffer);
  }

  @Get('invoices/workshop/:summaryId/download')
  @UseGuards(AuthGuard('jwt'))
  async downloadWorkshopInvoice(
    @Req() req: AuthenticatedRequest,
    @Param('summaryId', new ParseUUIDPipe()) summaryId: string,
    @Res() res: Response,
  ) {
    const pdfBuffer = await this.paymentsService.getWorkshopInvoicePdf(
      summaryId,
      req.user.id,
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="invoice-workshop-${summaryId}.pdf"`,
    );

    return res.send(pdfBuffer);
  }
}
