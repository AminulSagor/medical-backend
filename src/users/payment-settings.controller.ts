import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';
import { PaymentSettingsService } from './payment-settings.service';
import { UpdateBillingAddressDto } from './dto/payment-settings.dto';

@Controller('users/settings')
@UseGuards(AuthGuard('jwt'))
export class PaymentSettingsController {
  constructor(
    private readonly paymentSettingsService: PaymentSettingsService,
  ) {}

  // --- Payment Methods ---

  @Get('payment-methods')
  getSavedPaymentMethods(@Req() req: AuthenticatedRequest) {
    return this.paymentSettingsService.getSavedPaymentMethods(req.user.id);
  }

  @Post('payment-methods/setup-intent')
  createSetupIntent(@Req() req: AuthenticatedRequest) {
    // Returns a client_secret. Frontend uses this with Stripe Elements
    // (stripe.confirmCardSetup) to securely save the card without hitting your backend directly.
    return this.paymentSettingsService.createSetupIntent(req.user.id);
  }

  @Patch('payment-methods/:id/default')
  setDefaultPaymentMethod(
    @Req() req: AuthenticatedRequest,
    @Param('id') paymentMethodId: string,
  ) {
    return this.paymentSettingsService.setDefaultPaymentMethod(
      req.user.id,
      paymentMethodId,
    );
  }

  @Delete('payment-methods/:id')
  removePaymentMethod(
    @Req() req: AuthenticatedRequest,
    @Param('id') paymentMethodId: string,
  ) {
    return this.paymentSettingsService.removePaymentMethod(
      req.user.id,
      paymentMethodId,
    );
  }

  // --- Billing Address ---

  @Get('billing-address')
  getBillingAddress(@Req() req: AuthenticatedRequest) {
    return this.paymentSettingsService.getBillingAddress(req.user.id);
  }

  @Patch('billing-address')
  updateBillingAddress(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateBillingAddressDto,
  ) {
    return this.paymentSettingsService.updateBillingAddress(req.user.id, dto);
  }
}
