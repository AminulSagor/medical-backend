import {
  BadRequestException,
  Injectable,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import Stripe from 'stripe';
import { UpdateBillingAddressDto } from './dto/payment-settings.dto';

@Injectable()
export class PaymentSettingsService {
  private stripe: any;

  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      throw new InternalServerErrorException('STRIPE_SECRET_KEY is missing');
    }

    this.stripe = Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16' as any,
    });
  }

  // ── HELPER: Get or Create Stripe Customer ──
  private async getOrCreateStripeCustomer(user: User): Promise<string> {
    // Assuming you have a 'stripeCustomerId' column in your User entity.
    // If not, please add: @Column({ nullable: true }) stripeCustomerId?: string;
    if ((user as any).stripeCustomerId) {
      return (user as any).stripeCustomerId;
    }

    const customer = await this.stripe.customers.create({
      email: user.medicalEmail,
      name: user.fullLegalName || `${user.firstName} ${user.lastName}`.trim(),
    });

    (user as any).stripeCustomerId = customer.id;
    await this.usersRepo.save(user);

    return customer.id;
  }

  // ── 1. GET ALL SAVED CARDS FROM STRIPE ──
  async getSavedPaymentMethods(userId: string) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const customerId = (user as any).stripeCustomerId;
    if (!customerId) {
      return { data: [] }; // No customer means no saved cards
    }

    // Fetch saved cards directly from Stripe
    const paymentMethods = await this.stripe.paymentMethods.list({
      customer: customerId,
      type: 'card',
    });

    // Fetch customer to check which card is the default
    const customer = await this.stripe.customers.retrieve(customerId);
    const defaultPaymentMethodId =
      !customer.deleted && customer.invoice_settings?.default_payment_method
        ? customer.invoice_settings.default_payment_method
        : null;

    const cards = paymentMethods.data.map((pm) => ({
      id: pm.id,
      brand: pm.card?.brand || 'Unknown',
      last4: pm.card?.last4 || '****',
      expMonth: pm.card?.exp_month,
      expYear: pm.card?.exp_year,
      isDefault: pm.id === defaultPaymentMethodId,
    }));

    return {
      message: 'Payment methods retrieved successfully',
      data: cards,
    };
  }

  // ── 2. CREATE SETUP INTENT (For Frontend Elements to securely add card) ──
  async createSetupIntent(userId: string) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const customerId = await this.getOrCreateStripeCustomer(user);

    // Create a SetupIntent to allow frontend to securely collect card details
    const setupIntent = await this.stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
    });

    return {
      message: 'Setup intent created',
      data: {
        clientSecret: setupIntent.client_secret,
      },
    };
  }

  // ── 3. SET DEFAULT PAYMENT METHOD ──
  async setDefaultPaymentMethod(userId: string, paymentMethodId: string) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const customerId = (user as any).stripeCustomerId;
    if (!customerId) throw new BadRequestException('No Stripe customer found');

    // Update customer's default payment method in Stripe
    await this.stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    return {
      message: 'Default payment method updated successfully',
    };
  }

  // ── 4. REMOVE PAYMENT METHOD ──
  async removePaymentMethod(userId: string, paymentMethodId: string) {
    try {
      // Detach the card from the Stripe customer
      await this.stripe.paymentMethods.detach(paymentMethodId);
      return {
        message: 'Payment method removed successfully',
      };
    } catch (error) {
      throw new BadRequestException(
        error.message || 'Failed to remove payment method',
      );
    }
  }

  // ── 5. GET REAL BILLING ADDRESS (From Stripe Customer) ──
  async getBillingAddress(userId: string) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const customerId = (user as any).stripeCustomerId;
    if (!customerId) {
      // Fallback to local profile if no stripe customer exists yet
      return {
        data: {
          fullName:
            user.fullLegalName || `${user.firstName} ${user.lastName}`.trim(),
          addressLine1: '',
          addressLine2: '',
          city: '',
          state: '',
          zipCode: '',
          country: 'US',
        },
      };
    }

    const customer = await this.stripe.customers.retrieve(customerId);
    if (customer.deleted) throw new BadRequestException('Customer deleted');

    const address = customer.address || {};

    return {
      message: 'Billing address retrieved',
      data: {
        fullName: customer.name || `${user.firstName} ${user.lastName}`.trim(),
        addressLine1: address.line1 || '',
        addressLine2: address.line2 || '',
        city: address.city || '',
        state: address.state || '',
        zipCode: address.postal_code || '',
        country: address.country || 'US',
      },
    };
  }

  // ── 6. UPDATE BILLING ADDRESS (Sync to Stripe) ──
  async updateBillingAddress(userId: string, dto: UpdateBillingAddressDto) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const customerId = await this.getOrCreateStripeCustomer(user);

    // Sync updated address strictly to Stripe
    await this.stripe.customers.update(customerId, {
      name: dto.fullName,
      address: {
        line1: dto.addressLine1,
        line2: dto.addressLine2 || undefined,
        city: dto.city,
        state: dto.state,
        postal_code: dto.zipCode,
        country: dto.country || 'US',
      },
    });

    return {
      message: 'Billing address updated successfully',
      data: dto,
    };
  }
}
