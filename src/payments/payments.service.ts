import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe = require('stripe');
import { Product } from '../products/entities/product.entity';
import { User } from '../users/entities/user.entity';
import { Order } from '../orders/entities/order.entity';
import { OrderTimeline } from '../orders/entities/order-timeline.entity';
import {
  FulfillmentStatus,
  OrderType,
  PaymentStatus,
  TimelineEventType,
} from 'src/common/enums/order.enums';
import {
  OrderSummaryStatus,
  WorkshopOrderSummary,
} from '../workshops/entities/workshop-order-summary.entity';
import {
  PaymentDomainType,
  PaymentProvider,
  PaymentTransaction,
  PaymentTransactionStatus,
} from './entities/payment-transaction.entity';
import {
  CheckoutSessionItemDto,
  CheckoutShippingAddressDto,
  CreateCheckoutSessionDto,
} from './dto/create-checkout-session.dto';
import { CreateProductOrderSummaryDto } from './dto/create-product-order-summary.dto';
import {
  ReservationStatus,
  WorkshopReservation,
} from '../workshops/entities/workshop-reservation.entity';
import { WorkshopStatus } from '../workshops/entities/workshop.entity';
import {
  ProductOrderSummary,
  ProductOrderSummaryItem,
  ProductOrderSummaryStatus,
} from './entities/product-order-summary.entity';
import { CartService } from 'src/cart/cart.service';
import { MailService } from 'src/common/services/mail.service';
import { InvoiceService } from 'src/common/services/invoice.service';

type ProductCalculatedItem = {
  productId: string;
  name: string;
  sku: string | null;
  photo: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  availableQuantity: number;
  inStock: boolean;
};

type ProductCalculatedSummary = {
  items: ProductCalculatedItem[];
  subtotal: number;
  estimatedShipping: number;
  estimatedTax: number;
  orderTotal: number;
};

type ProductSummaryPayloadItem = {
  productId: string;
  name: string;
  sku: string | null;
  photo: string | null;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
  availableQuantity: number;
  inStock: boolean;
};

type ProductSummaryPayload = {
  items: ProductSummaryPayloadItem[];
  subtotal: string;
  estimatedShipping: string;
  estimatedTax: string;
  orderTotal: string;
};

@Injectable()
export class PaymentsService {
  private static readonly DEFAULT_TAX_RATE = 0.1;
  private static readonly DEFAULT_SHIPPING_AMOUNT = 15;
  private static readonly DEFAULT_FREE_SHIPPING_THRESHOLD = 200;

  constructor(
    @InjectRepository(PaymentTransaction)
    private readonly paymentsRepo: Repository<PaymentTransaction>,
    @InjectRepository(ProductOrderSummary)
    private readonly productOrderSummariesRepo: Repository<ProductOrderSummary>,
    @InjectRepository(Product)
    private readonly productsRepo: Repository<Product>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(Order)
    private readonly ordersRepo: Repository<Order>,
    @InjectRepository(OrderTimeline)
    private readonly timelineRepo: Repository<OrderTimeline>,
    @InjectRepository(WorkshopOrderSummary)
    private readonly workshopOrderSummariesRepo: Repository<WorkshopOrderSummary>,
    @InjectRepository(WorkshopReservation)
    private readonly workshopReservationsRepo: Repository<WorkshopReservation>,
    private readonly cartService: CartService,
    private readonly mailService: MailService,
    private readonly invoiceService: InvoiceService,
  ) {}

  private formatAmount(value: number): string {
    return value.toFixed(2);
  }

  private parsePositiveNumber(
    value: string | number | null | undefined,
  ): number {
    const n = Number(value ?? 0);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  private resolveProductUnitPrice(product: Product): number {
    const offerPrice = this.parsePositiveNumber(product.offerPrice);
    if (offerPrice > 0) {
      return offerPrice;
    }

    const actualPrice = this.parsePositiveNumber(product.actualPrice);
    if (actualPrice <= 0) {
      throw new BadRequestException(
        `Product ${product.id} has invalid pricing configuration`,
      );
    }

    return actualPrice;
  }

  private estimateShipping(subtotal: number): number {
    const configuredShipping = Number(
      process.env.CHECKOUT_ESTIMATED_SHIPPING ??
        PaymentsService.DEFAULT_SHIPPING_AMOUNT,
    );
    const configuredThreshold = Number(
      process.env.CHECKOUT_FREE_SHIPPING_THRESHOLD ??
        PaymentsService.DEFAULT_FREE_SHIPPING_THRESHOLD,
    );

    const shippingAmount =
      Number.isFinite(configuredShipping) && configuredShipping >= 0
        ? configuredShipping
        : PaymentsService.DEFAULT_SHIPPING_AMOUNT;
    const freeThreshold =
      Number.isFinite(configuredThreshold) && configuredThreshold >= 0
        ? configuredThreshold
        : PaymentsService.DEFAULT_FREE_SHIPPING_THRESHOLD;

    if (subtotal >= freeThreshold) {
      return 0;
    }

    return shippingAmount;
  }

  private estimateTax(subtotal: number): number {
    const configuredTaxRate = Number(
      process.env.CHECKOUT_ESTIMATED_TAX_RATE ??
        PaymentsService.DEFAULT_TAX_RATE,
    );
    const taxRate =
      Number.isFinite(configuredTaxRate) && configuredTaxRate >= 0
        ? configuredTaxRate
        : PaymentsService.DEFAULT_TAX_RATE;

    return subtotal * taxRate;
  }

  private normalizeShippingAddress(
    dto: CheckoutShippingAddressDto,
  ): CheckoutShippingAddressDto {
    return {
      fullName: dto.fullName.trim(),
      addressLine1: dto.addressLine1.trim(),
      addressLine2: dto.addressLine2?.trim() || undefined,
      city: dto.city.trim(),
      state: dto.state.trim(),
      zipCode: dto.zipCode.trim(),
      country: dto.country?.trim() || 'US',
    };
  }

  private requireShippingAddress(
    address: CheckoutShippingAddressDto | null,
  ): asserts address is CheckoutShippingAddressDto {
    if (!address) {
      throw new BadRequestException(
        'Shipping address is required before checkout',
      );
    }

    if (
      !address.fullName ||
      !address.addressLine1 ||
      !address.city ||
      !address.state ||
      !address.zipCode
    ) {
      throw new BadRequestException(
        'Shipping address requires fullName, addressLine1, city, state, zipCode',
      );
    }
  }

  private getUserShippingAddress(
    user: User,
  ): CheckoutShippingAddressDto | null {
    const fullName =
      user.shippingFullName?.trim() || user.fullLegalName?.trim();
    const addressLine1 = user.shippingAddressLine1?.trim();
    const city = user.shippingCity?.trim();
    const state = user.shippingState?.trim();
    const zipCode = user.shippingPostalCode?.trim();

    if (!fullName || !addressLine1 || !city || !state || !zipCode) {
      return null;
    }

    return {
      fullName,
      addressLine1,
      addressLine2: user.shippingAddressLine2?.trim() || undefined,
      city,
      state,
      zipCode,
      country: user.shippingCountry?.trim() || 'US',
    };
  }

  private async saveUserShippingAddress(
    user: User,
    address: CheckoutShippingAddressDto,
  ) {
    user.shippingFullName = address.fullName;
    user.shippingAddressLine1 = address.addressLine1;
    user.shippingAddressLine2 = address.addressLine2;
    user.shippingCity = address.city;
    user.shippingState = address.state;
    user.shippingPostalCode = address.zipCode;
    user.shippingCountry = address.country || 'US';
    await this.usersRepo.save(user);
  }

  private getProductStockQuantity(product: Product): number {
    const stock = Number((product as any).stockQuantity ?? 0);
    return Number.isFinite(stock) && stock > 0 ? stock : 0;
  }

  private ensureProductHasEnoughStock(
    product: Product,
    requestedQuantity: number,
  ) {
    if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0) {
      throw new BadRequestException(
        `Invalid quantity requested for product ${product.id}`,
      );
    }

    const availableStock = this.getProductStockQuantity(product);

    if (availableStock < requestedQuantity) {
      throw new BadRequestException(
        `${product.name} does not have enough stock. Available: ${availableStock}, requested: ${requestedQuantity}`,
      );
    }
  }

  private async validateProductStockFromSummary(
    summary: ProductCalculatedSummary,
  ): Promise<void> {
    if (!summary.items || summary.items.length === 0) {
      throw new BadRequestException('At least one cart item is required');
    }

    const mergedQtyByProductId = new Map<string, number>();

    for (const item of summary.items) {
      mergedQtyByProductId.set(
        item.productId,
        (mergedQtyByProductId.get(item.productId) ?? 0) +
          Number(item.quantity ?? 0),
      );
    }

    const uniqueProductIds = [...mergedQtyByProductId.keys()];
    const products = await this.productsRepo.find({
      where: uniqueProductIds.map((id) => ({ id, isActive: true })),
    });

    if (products.length !== uniqueProductIds.length) {
      throw new BadRequestException('Some products are invalid or inactive');
    }

    const productMap = new Map(
      products.map((product) => [product.id, product]),
    );

    for (const [productId, quantity] of mergedQtyByProductId.entries()) {
      const product = productMap.get(productId);
      if (!product) {
        throw new BadRequestException(`Product not found: ${productId}`);
      }

      this.ensureProductHasEnoughStock(product, quantity);
    }
  }

  private async buildProductSummary(
    items: CheckoutSessionItemDto[],
  ): Promise<ProductCalculatedSummary> {
    if (!items || items.length === 0) {
      throw new BadRequestException('At least one cart item is required');
    }

    const mergedQtyByProductId = new Map<string, number>();
    for (const item of items) {
      mergedQtyByProductId.set(
        item.productId,
        (mergedQtyByProductId.get(item.productId) ?? 0) + item.quantity,
      );
    }

    const uniqueProductIds = [...mergedQtyByProductId.keys()];
    const products = await this.productsRepo.find({
      where: uniqueProductIds.map((id) => ({ id, isActive: true })),
      relations: ['details'],
    });

    if (products.length !== uniqueProductIds.length) {
      throw new BadRequestException('Some products are invalid or inactive');
    }

    const productMap = new Map(
      products.map((product) => [product.id, product]),
    );

    let subtotal = 0;
    const mappedItems: ProductCalculatedItem[] = uniqueProductIds.map(
      (productId) => {
        const product = productMap.get(productId);
        if (!product) {
          throw new BadRequestException(`Product not found: ${productId}`);
        }

        const quantity = mergedQtyByProductId.get(productId) ?? 0;
        const availableQuantity = Number(product.stockQuantity ?? 0);
        const inStock = availableQuantity > 0;

        const unitPrice = this.resolveProductUnitPrice(product);
        const lineTotal = unitPrice * quantity;
        subtotal += lineTotal;

        return {
          productId: product.id,
          name: product.name,
          sku: product.sku ?? null,
          photo: product.details?.images?.[0] ?? null,
          quantity,
          unitPrice,
          lineTotal,
          availableQuantity,
          inStock,
        };
      },
    );

    const estimatedShipping = this.estimateShipping(subtotal);
    const estimatedTax = this.estimateTax(subtotal);
    const orderTotal = subtotal + estimatedShipping + estimatedTax;

    return {
      items: mappedItems,
      subtotal,
      estimatedShipping,
      estimatedTax,
      orderTotal,
    };
  }

  private toProductSummaryPayload(
    summary: ProductCalculatedSummary,
  ): ProductSummaryPayload {
    return {
      items: summary.items.map((item) => ({
        productId: item.productId,
        name: item.name,
        sku: item.sku,
        photo: item.photo,
        quantity: item.quantity,
        unitPrice: this.formatAmount(item.unitPrice),
        lineTotal: this.formatAmount(item.lineTotal),
        availableQuantity: item.availableQuantity,
        inStock: item.inStock,
      })),
      subtotal: this.formatAmount(summary.subtotal),
      estimatedShipping: this.formatAmount(summary.estimatedShipping),
      estimatedTax: this.formatAmount(summary.estimatedTax),
      orderTotal: this.formatAmount(summary.orderTotal),
    };
  }

  private toCalculatedSummaryFromSaved(
    summary: ProductOrderSummary,
  ): ProductCalculatedSummary {
    return {
      items: (summary.items ?? []).map((item) => ({
        productId: item.productId,
        name: item.name,
        sku: item.sku,
        photo: item.photo,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        lineTotal: Number(item.lineTotal),
        availableQuantity: Number((item as any).availableQuantity ?? 0),
        inStock: Boolean((item as any).inStock ?? false),
      })),
      subtotal: Number(summary.subtotal),
      estimatedShipping: Number(summary.shippingAmount),
      estimatedTax: Number(summary.taxAmount),
      orderTotal: Number(summary.totalAmount),
    };
  }

  private getProductSummaryExpiryMinutes(): number {
    const configured = Number(
      process.env.PRODUCT_ORDER_SUMMARY_EXPIRES_MINUTES ?? 30,
    );
    return Number.isFinite(configured) && configured > 0 ? configured : 30;
  }

  private async createSavedProductOrderSummary(
    userId: string,
    summary: ProductCalculatedSummary,
  ): Promise<ProductOrderSummary> {
    const payload = this.toProductSummaryPayload(summary);
    const expiresAt = new Date(
      Date.now() + this.getProductSummaryExpiryMinutes() * 60 * 1000,
    );

    const entity = this.productOrderSummariesRepo.create({
      userId,
      currency: 'usd',
      items: payload.items as ProductOrderSummaryItem[],
      subtotal: payload.subtotal,
      shippingAmount: payload.estimatedShipping,
      taxAmount: payload.estimatedTax,
      totalAmount: payload.orderTotal,
      status: ProductOrderSummaryStatus.PENDING,
      expiresAt,
    });

    return this.productOrderSummariesRepo.save(entity);
  }

  private async getOwnedProductOrderSummary(
    userId: string,
    orderSummaryId: string,
  ): Promise<ProductOrderSummary> {
    const summary = await this.productOrderSummariesRepo.findOne({
      where: { id: orderSummaryId, userId },
    });

    if (!summary) {
      throw new NotFoundException('Order summary not found');
    }

    return summary;
  }

  private async ensurePendingAndNotExpired(
    summary: ProductOrderSummary,
  ): Promise<ProductOrderSummary> {
    if (summary.status === ProductOrderSummaryStatus.COMPLETED) {
      return summary;
    }

    if (summary.status === ProductOrderSummaryStatus.EXPIRED) {
      throw new BadRequestException('Order summary expired, create a new one');
    }

    if (summary.expiresAt && summary.expiresAt.getTime() < Date.now()) {
      summary.status = ProductOrderSummaryStatus.EXPIRED;
      await this.productOrderSummariesRepo.save(summary);
      throw new BadRequestException('Order summary expired, create a new one');
    }

    return summary;
  }

  private async sendProductInvoiceEmail(params: {
    orderId: string;
    payment: PaymentTransaction;
    user: User;
  }) {
    const order = await this.ordersRepo.findOne({
      where: { id: params.orderId } as any,
      relations: ['items'],
    });

    if (!order) {
      throw new NotFoundException('Order not found for invoice email');
    }

    const to = order.customerEmail?.trim() || params.user.medicalEmail?.trim();
    if (!to) {
      return;
    }

    const invoiceBuffer =
      await this.invoiceService.generateProductInvoiceBuffer({
        order: order as any,
        payment: params.payment,
        user: params.user,
      });

    const subject = `Payment received - ${order.orderNumber}`;
    const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6;">
      <h2>Payment Successful</h2>
      <p>Hello ${order.customerName || params.user.fullLegalName || 'Customer'},</p>
      <p>Your payment for order <b>${order.orderNumber}</b> was received successfully.</p>
      <p>Please find your invoice attached as a PDF for your records.</p>
      <p><b>Paid Amount:</b> $${Number(order.grandTotal || 0).toFixed(2)}</p>
      <p>Thank you for your purchase.</p>
    </div>
  `;

    const text = [
      'Payment Successful',
      '',
      `Hello ${order.customerName || params.user.fullLegalName || 'Customer'},`,
      `Your payment for order ${order.orderNumber} was received successfully.`,
      `Paid Amount: $${Number(order.grandTotal || 0).toFixed(2)}`,
      'Your invoice is attached as a PDF.',
      'Thank you for your purchase.',
    ].join('\n');

    await this.mailService.sendPaymentSuccessEmailWithInvoice({
      to,
      customerName: order.customerName,
      subject,
      html,
      text,
      invoiceFileName: `invoice-${order.orderNumber}.pdf`,
      invoiceBuffer,
    });
  }

  private async sendWorkshopInvoiceEmail(params: {
    summaryId: string;
    payment: PaymentTransaction;
    user: User;
  }) {
    const orderSummary = await this.workshopOrderSummariesRepo.findOne({
      where: { id: params.summaryId, userId: params.user.id } as any,
      relations: ['workshop', 'attendees'],
    });

    if (!orderSummary) {
      throw new NotFoundException(
        'Workshop order summary not found for invoice email',
      );
    }

    const to =
      params.user.medicalEmail?.trim() ||
      (params.user as any).email?.trim() ||
      null;

    if (!to) {
      console.warn(
        `Workshop invoice email skipped: no recipient email for user ${params.user.id}`,
      );
      return;
    }

    const invoiceBuffer =
      await this.invoiceService.generateWorkshopInvoiceBuffer({
        orderSummary,
        payment: params.payment,
        user: params.user,
      });

    const workshopTitle =
      (orderSummary as any).workshop?.title || 'Workshop Enrollment';
    const totalPrice = Number((orderSummary as any).totalPrice || 0);

    const subject = `Payment received - ${workshopTitle}`;
    const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6;">
      <h2>Workshop Payment Successful</h2>
      <p>Hello ${params.user.fullLegalName || 'Customer'},</p>
      <p>Your workshop payment was received successfully.</p>
      <p><b>Workshop:</b> ${workshopTitle}</p>
      <p><b>Paid Amount:</b> $${totalPrice.toFixed(2)}</p>
      <p>Your invoice is attached as a PDF for your records.</p>
      <p>Thank you.</p>
    </div>
  `;

    const text = [
      'Workshop Payment Successful',
      '',
      `Hello ${params.user.fullLegalName || 'Customer'},`,
      `Workshop: ${workshopTitle}`,
      `Paid Amount: $${totalPrice.toFixed(2)}`,
      'Your invoice is attached as a PDF.',
      'Thank you.',
    ].join('\n');

    await this.mailService.sendPaymentSuccessEmailWithInvoice({
      to,
      customerName: params.user.fullLegalName,
      subject,
      html,
      text,
      invoiceFileName: `invoice-workshop-${orderSummary.id.slice(0, 8)}.pdf`,
      invoiceBuffer,
    });

    console.log(
      `Workshop invoice email sent successfully to ${to} for summary ${orderSummary.id}`,
    );
  }

  async createProductOrderSummary(
    userId: string,
    dto: CreateProductOrderSummaryDto,
  ) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const summary = await this.buildProductSummary(
      dto.items as CheckoutSessionItemDto[],
    );
    const saved = await this.createSavedProductOrderSummary(userId, summary);

    return {
      message: 'Product order summary created successfully',
      data: {
        orderSummaryId: saved.id,
        status: saved.status,
        expiresAt: saved.expiresAt,
        ...this.toProductSummaryPayload(summary),
      },
    };
  }

  async getProductOrderSummary(userId: string, orderSummaryId: string) {
    const summary = await this.getOwnedProductOrderSummary(
      userId,
      orderSummaryId,
    );

    if (summary.status === ProductOrderSummaryStatus.PENDING) {
      await this.ensurePendingAndNotExpired(summary);
    }

    const calculated = this.toCalculatedSummaryFromSaved(summary);

    return {
      message: 'Product order summary fetched successfully',
      data: {
        orderSummaryId: summary.id,
        status: summary.status,
        expiresAt: summary.expiresAt,
        completedAt: summary.completedAt ?? null,
        ...this.toProductSummaryPayload(calculated),
      },
    };
  }

  private getStripeConfig(dto: CreateCheckoutSessionDto) {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      throw new BadRequestException('STRIPE_SECRET_KEY is not configured');
    }

    const successUrl =
      dto.successUrl || process.env.STRIPE_CHECKOUT_SUCCESS_URL;
    const cancelUrl = dto.cancelUrl || process.env.STRIPE_CHECKOUT_CANCEL_URL;

    if (!successUrl || !cancelUrl) {
      throw new BadRequestException(
        'successUrl and cancelUrl are required (request body or env)',
      );
    }

    return { stripeSecretKey, successUrl, cancelUrl };
  }

  async createCheckoutSession(userId: string, dto: CreateCheckoutSessionDto) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (dto.domainType === PaymentDomainType.PRODUCT) {
      return this.createProductCheckoutSession(user, dto);
    }

    if (dto.domainType === PaymentDomainType.WORKSHOP) {
      return this.createWorkshopCheckoutSession(user, dto);
    }

    throw new BadRequestException('Unsupported domainType');
  }

  private async createProductCheckoutSession(
    user: User,
    dto: CreateCheckoutSessionDto,
  ) {
    let productSummary: ProductOrderSummary;
    let summary: ProductCalculatedSummary;

    if (dto.orderSummaryId) {
      productSummary = await this.getOwnedProductOrderSummary(
        user.id,
        dto.orderSummaryId,
      );

      if (productSummary.status === ProductOrderSummaryStatus.COMPLETED) {
        return {
          message: 'Product payment already completed for this order summary',
          data: {
            orderSummaryId: productSummary.id,
            status: productSummary.status,
            paymentStatus: 'paid',
          },
        };
      }

      productSummary = await this.ensurePendingAndNotExpired(productSummary);
      summary = this.toCalculatedSummaryFromSaved(productSummary);
    } else {
      if (!dto.items || dto.items.length === 0) {
        throw new BadRequestException(
          'Either orderSummaryId or items is required for product checkout sessions',
        );
      }

      summary = await this.buildProductSummary(dto.items);
      productSummary = await this.createSavedProductOrderSummary(
        user.id,
        summary,
      );
    }

    await this.validateProductStockFromSummary(summary);

    const incomingShipping = dto.shippingAddress
      ? this.normalizeShippingAddress(dto.shippingAddress)
      : null;
    const shippingAddress =
      incomingShipping ?? this.getUserShippingAddress(user);
    this.requireShippingAddress(shippingAddress);

    if (incomingShipping) {
      await this.saveUserShippingAddress(user, incomingShipping);
    }

    const { stripeSecretKey, successUrl, cancelUrl } =
      this.getStripeConfig(dto);
    const stripe = Stripe(stripeSecretKey);

    // Expire any stale pending payments for this order summary so a fresh
    // Stripe session is always created (old Stripe URLs may have expired).
    const existingPending = await this.paymentsRepo.find({
      where: {
        userId: user.id,
        domainType: PaymentDomainType.PRODUCT,
        domainRefId: productSummary.id,
        status: PaymentTransactionStatus.PENDING,
      },
    });

    if (existingPending.length > 0) {
      for (const old of existingPending) {
        old.status = PaymentTransactionStatus.EXPIRED;
        await this.paymentsRepo.save(old);
      }
    }

    const payment = this.paymentsRepo.create({
      userId: user.id,
      domainType: PaymentDomainType.PRODUCT,
      domainRefId: productSummary.id,
      provider: PaymentProvider.STRIPE,
      amount: this.formatAmount(summary.orderTotal),
      currency: 'usd',
      status: PaymentTransactionStatus.CREATED,
      idempotencyKey: `${user.id}:product:${productSummary.id}:${Date.now()}`,
      metadata: {
        orderSummaryId: productSummary.id,
        orderSummary: this.toProductSummaryPayload(summary),
        items: this.toProductSummaryPayload(summary).items,
        shippingAddress,
      },
    });

    const savedPayment = await this.paymentsRepo.save(payment);

    const lineItems = summary.items.map((item) => ({
      quantity: item.quantity,
      price_data: {
        currency: 'usd',
        unit_amount: Math.round(item.unitPrice * 100),
        product_data: {
          name: item.name,
          metadata: {
            productId: item.productId,
            sku: item.sku ?? '',
          },
        },
      },
    }));

    if (summary.estimatedShipping > 0) {
      lineItems.push({
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: Math.round(summary.estimatedShipping * 100),
          product_data: {
            name: 'Estimated Shipping',
            metadata: {
              productId: 'shipping',
              sku: 'shipping',
            },
          },
        },
      });
    }

    if (summary.estimatedTax > 0) {
      lineItems.push({
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: Math.round(summary.estimatedTax * 100),
          product_data: {
            name: 'Estimated Tax',
            metadata: {
              productId: 'tax',
              sku: 'tax',
            },
          },
        },
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: user.medicalEmail?.trim() || undefined,
      line_items: lineItems,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        paymentId: savedPayment.id,
        domainType: PaymentDomainType.PRODUCT,
        userId: user.id,
        orderSummaryId: productSummary.id,
      },
    });

    savedPayment.providerSessionId = session.id;
    savedPayment.providerPaymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : undefined;
    savedPayment.status = PaymentTransactionStatus.PENDING;
    savedPayment.metadata = {
      ...(savedPayment.metadata ?? {}),
      sessionId: session.id,
      checkoutUrl: session.url,
    };

    await this.paymentsRepo.save(savedPayment);

    return {
      message: 'Checkout session created successfully',
      data: {
        paymentId: savedPayment.id,
        domainType: PaymentDomainType.PRODUCT,
        sessionId: session.id,
        checkoutUrl: session.url,
        orderSummaryId: productSummary.id,
        shippingAddress,
        orderSummary: this.toProductSummaryPayload(summary),
      },
    };
  }

  private async createWorkshopCheckoutSession(
    user: User,
    dto: CreateCheckoutSessionDto,
  ) {
    if (!dto.orderSummaryId) {
      throw new BadRequestException(
        'orderSummaryId is required for workshop checkout. Call POST /workshops/checkout/order-summary first.',
      );
    }

    const orderSummary = await this.workshopOrderSummariesRepo.findOne({
      where: {
        id: dto.orderSummaryId,
        userId: user.id,
      },
      relations: ['workshop', 'attendees'],
    });

    if (!orderSummary) {
      throw new NotFoundException(
        'Workshop order summary not found. Please create one first via POST /workshops/checkout/order-summary.',
      );
    }

    if (orderSummary.status === OrderSummaryStatus.EXPIRED) {
      throw new BadRequestException(
        'Order summary already used for reservation',
      );
    }

    if (orderSummary.status === OrderSummaryStatus.COMPLETED) {
      return {
        message: 'Workshop payment already verified for this order summary',
        data: {
          orderSummaryId: orderSummary.id,
          status: orderSummary.status,
          paymentStatus: 'paid',
        },
      };
    }

    const workshop = orderSummary.workshop;
    if (!workshop || workshop.status !== WorkshopStatus.PUBLISHED) {
      throw new NotFoundException(
        'Workshop not found or not available for booking',
      );
    }

    const reservedSeatsResult = await this.workshopReservationsRepo
      .createQueryBuilder('r')
      .select('SUM(r.numberOfSeats)', 'total')
      .where('r.workshopId = :workshopId', { workshopId: workshop.id })
      .andWhere('r.status != :cancelledStatus', {
        cancelledStatus: ReservationStatus.CANCELLED,
      })
      .getRawOne();

    const reservedSeats = Number(reservedSeatsResult?.total || 0);
    const availableSeats = workshop.capacity - reservedSeats;

    if (
      availableSeats <
      (orderSummary.attendees?.length || orderSummary.numberOfSeats)
    ) {
      throw new BadRequestException(
        'Not enough seats available for this workshop',
      );
    }

    const { stripeSecretKey, successUrl, cancelUrl } =
      this.getStripeConfig(dto);
    const stripe = Stripe(stripeSecretKey);

    const unitAmount = Math.round(Number(orderSummary.pricePerSeat) * 100);
    if (!Number.isFinite(unitAmount) || unitAmount <= 0) {
      throw new BadRequestException('Invalid order summary amount');
    }

    const numberOfAttendees =
      orderSummary.attendees?.length || orderSummary.numberOfSeats || 1;
    const pricePerSeat = Number(orderSummary.pricePerSeat);
    const totalPrice = Number(orderSummary.totalPrice);

    // Check for existing pending payment for this order summary
    const existingPending = await this.paymentsRepo.findOne({
      where: {
        userId: user.id,
        domainType: PaymentDomainType.WORKSHOP,
        domainRefId: orderSummary.id,
        status: PaymentTransactionStatus.PENDING,
      },
      order: { createdAt: 'DESC' },
    });

    if (existingPending?.providerSessionId) {
      return {
        message: 'Checkout session already exists for this order summary',
        data: {
          paymentId: existingPending.id,
          domainType: PaymentDomainType.WORKSHOP,
          sessionId: existingPending.providerSessionId,
          checkoutUrl: existingPending.metadata?.checkoutUrl ?? null,
          workshop: {
            id: workshop.id,
            title: workshop.title,
            registrationDeadline: workshop.registrationDeadline ?? null,
          },
          orderSummaryId: orderSummary.id,
          numberOfAttendees: numberOfAttendees,
          totalPrice: this.formatAmount(totalPrice),
        },
      };
    }

    const payment = this.paymentsRepo.create({
      userId: user.id,
      domainType: PaymentDomainType.WORKSHOP,
      domainRefId: orderSummary.id,
      provider: PaymentProvider.STRIPE,
      amount: this.formatAmount(totalPrice),
      currency: 'usd',
      status: PaymentTransactionStatus.CREATED,
      idempotencyKey: `${user.id}:workshop:${orderSummary.id}:${Date.now()}`,
      metadata: {
        orderSummaryId: orderSummary.id,
        workshopId: workshop.id,
        workshopTitle: workshop.title,
        numberOfAttendees: numberOfAttendees,
        pricePerSeat: pricePerSeat,
        totalPrice: totalPrice,
      },
    });

    const savedPayment = await this.paymentsRepo.save(payment);

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          quantity: numberOfAttendees,
          price_data: {
            currency: 'usd',
            unit_amount: unitAmount,
            product_data: {
              name: `Workshop: ${workshop.title}`,
              metadata: {
                workshopId: workshop.id,
                orderSummaryId: orderSummary.id,
              },
            },
          },
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        paymentId: savedPayment.id,
        domainType: PaymentDomainType.WORKSHOP,
        userId: user.id,
        orderSummaryId: orderSummary.id,
      },
    });

    savedPayment.providerSessionId = session.id;
    savedPayment.providerPaymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : undefined;
    savedPayment.status = PaymentTransactionStatus.PENDING;
    savedPayment.metadata = {
      ...(savedPayment.metadata ?? {}),
      sessionId: session.id,
      checkoutUrl: session.url,
    };

    await this.paymentsRepo.save(savedPayment);

    return {
      message: 'Checkout session created successfully',
      data: {
        paymentId: savedPayment.id,
        domainType: PaymentDomainType.WORKSHOP,
        sessionId: session.id,
        checkoutUrl: session.url,
        workshop: {
          id: workshop.id,
          title: workshop.title,
          registrationDeadline: workshop.registrationDeadline ?? null,
        },
        orderSummaryId: orderSummary.id,
        numberOfAttendees: numberOfAttendees,
        totalPrice: this.formatAmount(totalPrice),
      },
    };
  }

  async handleStripeWebhook(rawBody: Buffer | undefined, signature?: string) {
    if (!rawBody) {
      throw new BadRequestException(
        'rawBody is required for webhook signature verification',
      );
    }

    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!stripeSecretKey) {
      throw new BadRequestException('STRIPE_SECRET_KEY is not configured');
    }

    if (!webhookSecret) {
      throw new BadRequestException('STRIPE_WEBHOOK_SECRET is not configured');
    }

    const stripe = Stripe(stripeSecretKey);

    let event: any;
    try {
      const bypassToken = process.env.STRIPE_TEST_BYPASS_TOKEN;
      const isDevelopment = process.env.NODE_ENV !== 'production';

      if (isDevelopment && bypassToken && signature === bypassToken) {
        event = JSON.parse(rawBody.toString());
      } else {
        event = stripe.webhooks.constructEvent(
          rawBody,
          signature,
          webhookSecret,
        );
      }
    } catch (err) {
      throw new BadRequestException('Invalid Stripe webhook signature');
    }

    if (event.type === 'checkout.session.completed') {
      await this.handleCheckoutSessionCompleted(event.data.object);
    }

    if (event.type === 'checkout.session.expired') {
      await this.handleCheckoutSessionExpired(event.data.object);
    }

    return {
      received: true,
      eventType: event.type,
    };
  }

  private async handleCheckoutSessionCompleted(session: any) {
    const paymentId = session.metadata?.paymentId;
    if (!paymentId) {
      return;
    }

    const payment = await this.paymentsRepo.findOne({
      where: { id: paymentId },
    });
    if (!payment) {
      return;
    }

    if (
      payment.status === PaymentTransactionStatus.PAID &&
      payment.finalizedRefId
    ) {
      return;
    }

    if (payment.providerSessionId && payment.providerSessionId !== session.id) {
      throw new BadRequestException(
        `Webhook session mismatch. Expected ${payment.providerSessionId}, got ${session.id}`,
      );
    }

    payment.providerSessionId = session.id;
    payment.providerPaymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : payment.providerPaymentIntentId;
    payment.status = PaymentTransactionStatus.PAID;
    payment.paidAt = new Date();

    await this.paymentsRepo.save(payment);

    if (!payment.finalizedRefId) {
      if (payment.domainType === PaymentDomainType.PRODUCT) {
        const orderId = await this.finalizeProductPayment(payment, session);
        payment.finalizedRefId = orderId;
      }

      if (payment.domainType === PaymentDomainType.WORKSHOP) {
        const summaryId = await this.finalizeWorkshopPayment(payment);
        payment.finalizedRefId = summaryId;
      }

      await this.paymentsRepo.save(payment);
    }
  }

  private async handleCheckoutSessionExpired(session: any) {
    const paymentId = session.metadata?.paymentId;
    if (!paymentId) {
      return;
    }

    const payment = await this.paymentsRepo.findOne({
      where: { id: paymentId },
    });
    if (!payment) {
      return;
    }

    if (
      payment.status === PaymentTransactionStatus.PAID ||
      payment.status === PaymentTransactionStatus.REFUNDED
    ) {
      return;
    }

    payment.status = PaymentTransactionStatus.EXPIRED;
    payment.providerSessionId = session.id;
    await this.paymentsRepo.save(payment);

    if (payment.domainType === PaymentDomainType.PRODUCT) {
      const orderSummaryId =
        payment.metadata?.orderSummaryId ?? payment.domainRefId;

      if (orderSummaryId && orderSummaryId !== 'product_checkout') {
        await this.productOrderSummariesRepo.update(
          {
            id: orderSummaryId,
            userId: payment.userId,
            status: ProductOrderSummaryStatus.PENDING,
          },
          { status: ProductOrderSummaryStatus.EXPIRED },
        );
      }
    }
  }

  private async generateOrderNumber(): Promise<string> {
    for (let i = 0; i < 5; i += 1) {
      const candidate = `ORD-${Date.now()}-${Math.floor(Math.random() * 9000) + 1000}`;
      const exists = await this.ordersRepo.exist({
        where: { orderNumber: candidate },
      });
      if (!exists) {
        return candidate;
      }
    }

    throw new BadRequestException('Could not generate unique order number');
  }

  private async finalizeProductPayment(
    payment: PaymentTransaction,
    session: any,
  ): Promise<string> {
    const metadata = payment.metadata ?? {};
    const orderSummary = metadata.orderSummary;
    const items = metadata.items;
    const shippingAddress = metadata.shippingAddress;

    if (!orderSummary || !Array.isArray(items) || !shippingAddress) {
      throw new BadRequestException(
        'Invalid payment metadata for product finalization',
      );
    }

    const user = await this.usersRepo.findOne({
      where: { id: payment.userId },
    });
    if (!user) {
      throw new NotFoundException('User not found for payment finalization');
    }

    const orderNumber = await this.generateOrderNumber();
    const orderSummaryId = metadata.orderSummaryId ?? payment.domainRefId;

    const savedOrderId = await this.productsRepo.manager.transaction(
      async (manager) => {
        const mergedQtyByProductId = new Map<string, number>();

        for (const item of items) {
          if (!item?.productId) {
            continue;
          }

          mergedQtyByProductId.set(
            item.productId,
            (mergedQtyByProductId.get(item.productId) ?? 0) +
              Number(item.quantity ?? 0),
          );
        }

        const uniqueProductIds = [...mergedQtyByProductId.keys()];
        if (uniqueProductIds.length === 0) {
          throw new BadRequestException(
            'No valid product items found for product finalization',
          );
        }

        const lockedProducts = await manager
          .getRepository(Product)
          .createQueryBuilder('product')
          .where('product.id IN (:...productIds)', {
            productIds: uniqueProductIds,
          })
          .andWhere('product.isActive = :isActive', { isActive: true })
          .setLock('pessimistic_write')
          .getMany();

        if (lockedProducts.length !== uniqueProductIds.length) {
          throw new BadRequestException(
            'Some products are invalid or inactive',
          );
        }

        const productMap = new Map(
          lockedProducts.map((product) => [product.id, product]),
        );

        for (const [
          productId,
          requestedQuantity,
        ] of mergedQtyByProductId.entries()) {
          const product = productMap.get(productId);
          if (!product) {
            throw new BadRequestException(`Product not found: ${productId}`);
          }

          this.ensureProductHasEnoughStock(product, requestedQuantity);
          (product as any).stockQuantity =
            this.getProductStockQuantity(product) - requestedQuantity;
        }

        await manager.getRepository(Product).save(lockedProducts);

        const order = manager.getRepository(Order).create({
          orderNumber,
          type: OrderType.PRODUCT,
          customerName:
            shippingAddress.fullName || user.fullLegalName || 'Guest Customer',
          customerEmail:
            user.medicalEmail?.trim() || `user-${user.id}@checkout.local`,
          customerPhone: user.phoneNumber,
          shippingAddressLine1: shippingAddress.addressLine1,
          shippingAddressLine2: shippingAddress.addressLine2,
          shippingCity: shippingAddress.city,
          shippingState: shippingAddress.state,
          shippingPostalCode: shippingAddress.zipCode,
          shippingCountry: shippingAddress.country || 'US',
          subtotal: String(orderSummary.subtotal),
          shippingAmount: String(orderSummary.estimatedShipping),
          taxAmount: String(orderSummary.estimatedTax),
          grandTotal: String(orderSummary.orderTotal),
          paymentStatus: PaymentStatus.PAID,
          fulfillmentStatus: FulfillmentStatus.UNFULFILLED,
          items: items.map((item: any) => ({
            productId: item.productId,
            productName: item.name,
            sku: item.sku || undefined,
            images: item.photo ? [item.photo] : [],
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            total: item.lineTotal,
          })) as any,
          timeline: [
            {
              eventType: TimelineEventType.ORDER_PLACED,
              title: 'Order Placed',
            },
            {
              eventType: TimelineEventType.PAYMENT_AUTHORIZED,
              title: 'Payment Authorized',
              description:
                typeof session.payment_intent === 'string'
                  ? `Payment intent: ${session.payment_intent}`
                  : undefined,
            },
          ] as any,
        } as any);

        const savedOrder = await manager
          .getRepository(Order)
          .save(order as any);

        if (orderSummaryId && orderSummaryId !== 'product_checkout') {
          const summary = await manager
            .getRepository(ProductOrderSummary)
            .findOne({
              where: { id: orderSummaryId, userId: payment.userId },
            });

          if (
            summary &&
            summary.status !== ProductOrderSummaryStatus.COMPLETED
          ) {
            summary.status = ProductOrderSummaryStatus.COMPLETED;
            summary.completedAt = new Date();
            await manager.getRepository(ProductOrderSummary).save(summary);
          }
        }

        return (savedOrder as any).id;
      },
    );

    try {
      await this.cartService.clearCart(user.id);
    } catch (cartError) {
      console.error(
        `Failed to clear cart for user ${user.id} after order ${orderNumber}:`,
        cartError,
      );
    }

    try {
      await this.sendProductInvoiceEmail({
        orderId: savedOrderId,
        payment,
        user,
      });
    } catch (emailError) {
      console.error(
        `Failed to send product invoice email for order ${orderNumber}:`,
        emailError,
      );
    }

    return savedOrderId;
  }

  // private async finalizeWorkshopPayment(
  //   payment: PaymentTransaction,
  // ): Promise<string> {
  //   const summaryId = payment.domainRefId || payment.metadata?.orderSummaryId;
  //   if (!summaryId) {
  //     throw new BadRequestException(
  //       'Invalid payment metadata for workshop finalization',
  //     );
  //   }

  //   const orderSummary = await this.workshopOrderSummariesRepo.findOne({
  //     where: { id: summaryId, userId: payment.userId },
  //   });

  //   if (!orderSummary) {
  //     throw new NotFoundException('Workshop order summary not found');
  //   }

  //   if (orderSummary.status === OrderSummaryStatus.COMPLETED) {
  //     return orderSummary.id;
  //   }

  //   if (orderSummary.status === OrderSummaryStatus.EXPIRED) {
  //     return orderSummary.id;
  //   }

  //   orderSummary.status = OrderSummaryStatus.COMPLETED;
  //   const saved = await this.workshopOrderSummariesRepo.save(orderSummary);
  //   return saved.id;
  // }

  private async finalizeWorkshopPayment(
    payment: PaymentTransaction,
  ): Promise<string> {
    const summaryId = payment.domainRefId || payment.metadata?.orderSummaryId;
    if (!summaryId) {
      throw new BadRequestException(
        'Invalid payment metadata for workshop finalization',
      );
    }

    const orderSummary = await this.workshopOrderSummariesRepo.findOne({
      where: { id: summaryId, userId: payment.userId },
      relations: ['workshop', 'attendees'],
    });

    if (!orderSummary) {
      throw new NotFoundException('Workshop order summary not found');
    }

    if (orderSummary.status !== OrderSummaryStatus.COMPLETED) {
      if (orderSummary.status !== OrderSummaryStatus.EXPIRED) {
        orderSummary.status = OrderSummaryStatus.COMPLETED;
        await this.workshopOrderSummariesRepo.save(orderSummary);
      }
    }

    const alreadySent = Boolean(payment.metadata?.workshopInvoiceEmailSentAt);

    if (!alreadySent) {
      try {
        const user = await this.usersRepo.findOne({
          where: { id: payment.userId },
        });

        if (!user) {
          throw new NotFoundException(
            'User not found for workshop invoice email',
          );
        }

        await this.sendWorkshopInvoiceEmail({
          summaryId: orderSummary.id,
          payment,
          user,
        });

        payment.metadata = {
          ...(payment.metadata ?? {}),
          workshopInvoiceEmailSentAt: new Date().toISOString(),
        };

        await this.paymentsRepo.save(payment);
      } catch (emailError) {
        console.error(
          `Failed to send workshop invoice email for summary ${orderSummary.id}:`,
          emailError,
        );
      }
    }

    return orderSummary.id;
  }

  async getProductInvoicePdf(orderId: string, userId: string): Promise<Buffer> {
    const order = await this.ordersRepo.findOne({
      where: { id: orderId } as any,
      relations: ['items'],
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if ((order.customerEmail || '').trim().toLowerCase() === '') {
      throw new BadRequestException('Order email not found');
    }

    const user = await this.usersRepo.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const payment = await this.paymentsRepo.findOne({
      where: {
        userId,
        domainType: PaymentDomainType.PRODUCT,
        finalizedRefId: orderId,
        status: PaymentTransactionStatus.PAID,
      } as any,
      order: { createdAt: 'DESC' } as any,
    });

    if (!payment) {
      throw new NotFoundException('Paid product payment not found');
    }

    return this.invoiceService.generateProductInvoiceBuffer({
      order: order as any,
      payment,
      user,
    });
  }

  async getWorkshopInvoicePdf(
    summaryId: string,
    userId: string,
  ): Promise<Buffer> {
    const orderSummary = await this.workshopOrderSummariesRepo.findOne({
      where: { id: summaryId, userId } as any,
      relations: ['workshop', 'attendees'],
    });

    if (!orderSummary) {
      throw new NotFoundException('Workshop order summary not found');
    }

    const user = await this.usersRepo.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const payment = await this.paymentsRepo.findOne({
      where: {
        userId,
        domainType: PaymentDomainType.WORKSHOP,
        finalizedRefId: summaryId,
        status: PaymentTransactionStatus.PAID,
      } as any,
      order: { createdAt: 'DESC' } as any,
    });

    if (!payment) {
      throw new NotFoundException('Paid workshop payment not found');
    }

    return this.invoiceService.generateWorkshopInvoiceBuffer({
      orderSummary,
      payment,
      user,
    });
  }

  async getSessionStatus(userId: string, sessionId: string) {
    let payment = await this.paymentsRepo.findOne({
      where: {
        userId,
        providerSessionId: sessionId,
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment session not found');
    }

    // If the payment hasn't been finalized yet, actively check with Stripe
    // as a fallback for delayed/missed webhooks.
    if (
      !payment.finalizedRefId &&
      (payment.status === PaymentTransactionStatus.PENDING ||
        payment.status === PaymentTransactionStatus.CREATED)
    ) {
      try {
        const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
        if (stripeSecretKey) {
          const stripe = Stripe(stripeSecretKey);
          const stripeSession =
            await stripe.checkout.sessions.retrieve(sessionId);

          if (stripeSession.payment_status === 'paid') {
            payment.providerPaymentIntentId =
              typeof stripeSession.payment_intent === 'string'
                ? stripeSession.payment_intent
                : payment.providerPaymentIntentId;
            payment.status = PaymentTransactionStatus.PAID;
            payment.paidAt = new Date();
            await this.paymentsRepo.save(payment);

            if (!payment.finalizedRefId) {
              if (payment.domainType === PaymentDomainType.PRODUCT) {
                const orderId = await this.finalizeProductPayment(
                  payment,
                  stripeSession,
                );
                payment.finalizedRefId = orderId;
              }

              if (payment.domainType === PaymentDomainType.WORKSHOP) {
                const summaryId = await this.finalizeWorkshopPayment(payment);
                payment.finalizedRefId = summaryId;
              }

              await this.paymentsRepo.save(payment);
            }
          }
        }
      } catch (err) {
        console.error(
          `Fallback Stripe verification failed for session ${sessionId}:`,
          err,
        );
      }
    }

    return {
      message: 'Payment session status fetched successfully',
      data: {
        paymentId: payment.id,
        domainType: payment.domainType,
        domainRefId: payment.domainRefId,
        status: payment.status,
        amount: payment.amount,
        currency: payment.currency,
        providerSessionId: payment.providerSessionId,
        finalizedRefId: payment.finalizedRefId ?? null,
        paidAt: payment.paidAt ?? null,
        updatedAt: payment.updatedAt,
      },
    };
  }
}
