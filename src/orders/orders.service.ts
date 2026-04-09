import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { Order } from './entities/order.entity';
import { OrderTimeline } from './entities/order-timeline.entity';
import { Product } from '../products/entities/product.entity';
import { User } from '../users/entities/user.entity';
import {
  FulfillmentStatus,
  OrderType,
  PaymentStatus,
  TimelineEventType,
} from 'src/common/enums/order.enums';
import { ListOrdersQueryDto } from './dto/list-orders.query.dto';
import { UpdateOrderDispatchDto } from './dto/update-order-dispatch.dto';
import { RefundOrderDto } from './dto/refund-order.dto';
import { PrintShippingLabelDto } from './dto/print-shipping-label.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { ListMyOrderHistoryQueryDto } from './dto/list-my-order-history.query.dto';
import {
  PublicOrderSummaryItemDto,
  PublicOrderSummaryRequestDto,
} from './dto/public-order-summary.dto';
import { ShippingAddressDto } from './dto/shipping-address.dto';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';
import PDFDocument from 'pdfkit';
import * as bwipjs from 'bwip-js';
import * as QRCode from 'qrcode';
import Stripe = require('stripe');

type CalculatedPublicOrderItem = {
  productId: string;
  name: string;
  sku: string | null;
  photo: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

type CalculatedPublicOrderSummary = {
  items: CalculatedPublicOrderItem[];
  subtotal: number;
  estimatedShipping: number;
  estimatedTax: number;
  orderTotal: number;
};

@Injectable()
export class OrdersService {
  private static readonly DEFAULT_TAX_RATE = 0.1;
  private static readonly DEFAULT_SHIPPING_AMOUNT = 15;
  private static readonly DEFAULT_FREE_SHIPPING_THRESHOLD = 200;

  constructor(
    @InjectRepository(Order)
    private readonly ordersRepo: Repository<Order>,
    @InjectRepository(OrderTimeline)
    private readonly timelineRepo: Repository<OrderTimeline>,
    @InjectRepository(Product)
    private readonly productsRepo: Repository<Product>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  private formatAmount(value: number): string {
    return value.toFixed(2);
  }

  private parsePositiveNumber(value: string | number | null | undefined): number {
    const n = Number(value ?? 0);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  private parseAmount(value: string | number | null | undefined): number {
    const n = Number(value ?? 0);
    return Number.isFinite(n) ? n : 0;
  }

  private buildComparisonMetric(
    currentValue: number,
    previousValue: number,
    baselineLabel: string,
  ) {
    let trend: 'increase' | 'decrease' | 'no_change' = 'no_change';
    let changePercentage = 0;

    if (previousValue <= 0) {
      if (currentValue > 0) {
        trend = 'increase';
        changePercentage = 100;
      }
    } else {
      const delta = ((currentValue - previousValue) / previousValue) * 100;
      changePercentage = Number(delta.toFixed(2));

      if (changePercentage > 0) {
        trend = 'increase';
      } else if (changePercentage < 0) {
        trend = 'decrease';
      }
    }

    const absolutePercentage = Number(Math.abs(changePercentage).toFixed(2));
    const comparisonText =
      trend === 'no_change'
        ? `no change vs ${baselineLabel}`
        : `${trend} ${absolutePercentage}% vs ${baselineLabel}`;

    return {
      current: currentValue,
      previous: previousValue,
      changePercentage,
      trend,
      comparisonText,
    };
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
        OrdersService.DEFAULT_SHIPPING_AMOUNT,
    );
    const configuredThreshold = Number(
      process.env.CHECKOUT_FREE_SHIPPING_THRESHOLD ??
        OrdersService.DEFAULT_FREE_SHIPPING_THRESHOLD,
    );

    const shippingAmount =
      Number.isFinite(configuredShipping) && configuredShipping >= 0
        ? configuredShipping
        : OrdersService.DEFAULT_SHIPPING_AMOUNT;
    const freeThreshold =
      Number.isFinite(configuredThreshold) && configuredThreshold >= 0
        ? configuredThreshold
        : OrdersService.DEFAULT_FREE_SHIPPING_THRESHOLD;

    if (subtotal >= freeThreshold) {
      return 0;
    }

    return shippingAmount;
  }

  private estimateTax(subtotal: number): number {
    const configuredTaxRate = Number(
      process.env.CHECKOUT_ESTIMATED_TAX_RATE ?? OrdersService.DEFAULT_TAX_RATE,
    );
    const taxRate =
      Number.isFinite(configuredTaxRate) && configuredTaxRate >= 0
        ? configuredTaxRate
        : OrdersService.DEFAULT_TAX_RATE;

    return subtotal * taxRate;
  }

  private normalizeShippingAddress(dto: ShippingAddressDto): ShippingAddressDto {
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

  private validateShippingAddress(address: ShippingAddressDto | null): asserts address is ShippingAddressDto {
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

  private getUserShippingAddress(user: User): ShippingAddressDto | null {
    const fullName = user.shippingFullName?.trim() || user.fullLegalName?.trim();
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

  private async buildPublicOrderSummary(
    items: PublicOrderSummaryItemDto[],
  ): Promise<CalculatedPublicOrderSummary> {
    if (!items || items.length === 0) {
      throw new BadRequestException('At least one cart item is required');
    }

    const uniqueProductIds = [...new Set(items.map((item) => item.productId))];

    const products = await this.productsRepo.find({
      where: uniqueProductIds.map((id) => ({ id, isActive: true })),
      relations: ['details'],
    });

    if (products.length !== uniqueProductIds.length) {
      throw new BadRequestException('Some products are invalid or inactive');
    }

    const productMap = new Map(products.map((product) => [product.id, product]));

    let subtotal = 0;
    const mappedItems: CalculatedPublicOrderItem[] = items.map((item) => {
      const product = productMap.get(item.productId);
      if (!product) {
        throw new BadRequestException(`Product not found: ${item.productId}`);
      }

      const unitPrice = this.resolveProductUnitPrice(product);
      const lineTotal = unitPrice * item.quantity;
      subtotal += lineTotal;

      return {
        productId: product.id,
        name: product.name,
        sku: product.sku ?? null,
        photo: product.details?.images?.[0] ?? null,
        quantity: item.quantity,
        unitPrice,
        lineTotal,
      };
    });

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

  private toPublicSummaryResponse(summary: CalculatedPublicOrderSummary) {
    return {
      items: summary.items.map((item) => ({
        productId: item.productId,
        name: item.name,
        sku: item.sku,
        photo: item.photo,
        quantity: item.quantity,
        unitPrice: this.formatAmount(item.unitPrice),
        lineTotal: this.formatAmount(item.lineTotal),
      })),
      subtotal: this.formatAmount(summary.subtotal),
      estimatedShipping: this.formatAmount(summary.estimatedShipping),
      estimatedTax: this.formatAmount(summary.estimatedTax),
      orderTotal: this.formatAmount(summary.orderTotal),
    };
  }

  private toStudentShippingStatus(status: FulfillmentStatus): string {
    switch (status) {
      case FulfillmentStatus.SHIPPED:
        return 'shipped';
      case FulfillmentStatus.RECEIVED:
      case FulfillmentStatus.CLOSED:
        return 'delivered';
      case FulfillmentStatus.PROCESSING:
      case FulfillmentStatus.UNFULFILLED:
      default:
        return 'processing';
    }
  }

  private normalizeOrderNumber(input: string): string {
    return input.trim().replace(/^#/, '');
  }

  private getOrderProgressSnapshot(status: FulfillmentStatus) {
    const steps: Array<{ status: FulfillmentStatus; label: string }> = [
      { status: FulfillmentStatus.UNFULFILLED, label: 'Order Placed' },
      { status: FulfillmentStatus.PROCESSING, label: 'Processing' },
      { status: FulfillmentStatus.SHIPPED, label: 'Shipped' },
      { status: FulfillmentStatus.RECEIVED, label: 'Delivered' },
    ];

    const currentStatusForProgress =
      status === FulfillmentStatus.CLOSED ? FulfillmentStatus.RECEIVED : status;

    const currentIndex = steps.findIndex(
      (step) => step.status === currentStatusForProgress,
    );

    const safeCurrentIndex = currentIndex >= 0 ? currentIndex : 0;

    return {
      current: steps[safeCurrentIndex],
      next: steps[safeCurrentIndex + 1] ?? null,
      nextSteps: steps.slice(safeCurrentIndex + 1),
      allSteps: steps.map((step, index) => ({
        ...step,
        state:
          index < safeCurrentIndex
            ? 'completed'
            : index === safeCurrentIndex
              ? 'current'
              : 'upcoming',
      })),
    };
  }

  private toMyOrderHistoryItem(order: Order) {
    const items = (order.items ?? []).map((item) => ({
      id: item.id,
      productId: item.productId ?? null,
      name: item.productName,
      sku: item.sku ?? null,
      image: item.image ?? null,
      quantity: item.quantity,
      unitPrice: this.parseAmount(item.unitPrice),
      lineTotal: this.parseAmount(item.total),
    }));

    return {
      id: order.id,
      orderId: order.orderNumber,
      orderedDate: order.createdAt,
      status: {
        paymentStatus: order.paymentStatus,
        fulfillmentStatus: order.fulfillmentStatus,
      },
      quantity: items.reduce((sum, item) => sum + item.quantity, 0),
      totals: {
        subtotal: this.parseAmount(order.subtotal),
        shipping: this.parseAmount(order.shippingAmount),
        tax: this.parseAmount(order.taxAmount),
        grandTotal: this.parseAmount(order.grandTotal),
      },
      itemDetails: items,
    };
  }

  async getPublicOrderSummary(dto: PublicOrderSummaryRequestDto) {
    const summary = await this.buildPublicOrderSummary(dto.items);

    return {
      message: 'Order summary calculated successfully',
      data: this.toPublicSummaryResponse(summary),
    };
  }

  async getMyRecentProductOrder(userId: string) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const order = await this.ordersRepo.findOne({
      where: {
        customerEmail: user.medicalEmail,
        type: OrderType.PRODUCT,
      },
      order: { createdAt: 'DESC' },
      relations: ['items'],
    });

    if (!order) {
      return {
        message: 'No recent product order found',
        data: null,
      };
    }

    const firstItem = order.items?.[0];

    return {
      message: 'Recent product order fetched successfully',
      data: {
        orderId: order.orderNumber,
        orderedAt: order.createdAt,
        orderedAtFullDate: order.createdAt.toISOString(),
        price: order.grandTotal,
        shippingStatus: this.toStudentShippingStatus(order.fulfillmentStatus),
        fulfillmentStatus: order.fulfillmentStatus,
        paymentStatus: order.paymentStatus,
        productName: firstItem?.productName ?? null,
        productImage: firstItem?.image ?? null,
        products: (order.items ?? []).map((item) => ({
          productId: item.productId ?? null,
          productName: item.productName,
          productImage: item.image ?? null,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineTotal: item.total,
        })),
      },
    };
  }

  async getMyOrderHistorySummary(userId: string) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const email = user.medicalEmail.trim().toLowerCase();
    const now = new Date();
    const startOfMonth = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
      0,
      0,
      0,
      0,
    );
    const startOfPreviousMonth = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      1,
      0,
      0,
      0,
      0,
    );
    const startOfYear = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
    const startOfPreviousYear = new Date(
      now.getFullYear() - 1,
      0,
      1,
      0,
      0,
      0,
      0,
    );
    const previousYearSameDateTime = new Date(now);
    previousYearSameDateTime.setFullYear(now.getFullYear() - 1);

    const activeDeliveries = await this.ordersRepo
      .createQueryBuilder('o')
      .where('LOWER(o.customerEmail) = :email', { email })
      .andWhere('o.type = :type', { type: OrderType.PRODUCT })
      .andWhere('o.paymentStatus = :paymentStatus', {
        paymentStatus: PaymentStatus.PAID,
      })
      .andWhere('o.fulfillmentStatus IN (:...statuses)', {
        statuses: [
          FulfillmentStatus.UNFULFILLED,
          FulfillmentStatus.PROCESSING,
          FulfillmentStatus.SHIPPED,
        ],
      })
      .getCount();

    const monthRaw = await this.ordersRepo
      .createQueryBuilder('o')
      .select('COUNT(o.id)', 'totalOrdered')
      .addSelect('COALESCE(SUM(o.grandTotal), 0)', 'orderedValue')
      .where('LOWER(o.customerEmail) = :email', { email })
      .andWhere('o.type = :type', { type: OrderType.PRODUCT })
      .andWhere('o.paymentStatus = :paymentStatus', {
        paymentStatus: PaymentStatus.PAID,
      })
      .andWhere('o.createdAt >= :startOfMonth', { startOfMonth })
      .getRawOne();

    const previousMonthRaw = await this.ordersRepo
      .createQueryBuilder('o')
      .select('COUNT(o.id)', 'totalOrdered')
      .addSelect('COALESCE(SUM(o.grandTotal), 0)', 'orderedValue')
      .where('LOWER(o.customerEmail) = :email', { email })
      .andWhere('o.type = :type', { type: OrderType.PRODUCT })
      .andWhere('o.paymentStatus = :paymentStatus', {
        paymentStatus: PaymentStatus.PAID,
      })
      .andWhere('o.createdAt >= :startOfPreviousMonth', {
        startOfPreviousMonth,
      })
      .andWhere('o.createdAt < :startOfMonth', { startOfMonth })
      .getRawOne();

    const lifetimeRaw = await this.ordersRepo
      .createQueryBuilder('o')
      .select('COALESCE(SUM(o.grandTotal), 0)', 'totalMoney')
      .where('LOWER(o.customerEmail) = :email', { email })
      .andWhere('o.type = :type', { type: OrderType.PRODUCT })
      .andWhere('o.paymentStatus = :paymentStatus', {
        paymentStatus: PaymentStatus.PAID,
      })
      .getRawOne();

    const yearRaw = await this.ordersRepo
      .createQueryBuilder('o')
      .select('COALESCE(SUM(o.grandTotal), 0)', 'orderedValueThisYear')
      .where('LOWER(o.customerEmail) = :email', { email })
      .andWhere('o.type = :type', { type: OrderType.PRODUCT })
      .andWhere('o.paymentStatus = :paymentStatus', {
        paymentStatus: PaymentStatus.PAID,
      })
      .andWhere('o.createdAt >= :startOfYear', { startOfYear })
      .getRawOne();

    const previousYearRaw = await this.ordersRepo
      .createQueryBuilder('o')
      .select('COALESCE(SUM(o.grandTotal), 0)', 'orderedValuePreviousYear')
      .where('LOWER(o.customerEmail) = :email', { email })
      .andWhere('o.type = :type', { type: OrderType.PRODUCT })
      .andWhere('o.paymentStatus = :paymentStatus', {
        paymentStatus: PaymentStatus.PAID,
      })
      .andWhere('o.createdAt >= :startOfPreviousYear', { startOfPreviousYear })
      .andWhere('o.createdAt <= :previousYearSameDateTime', {
        previousYearSameDateTime,
      })
      .getRawOne();

    const orderedThisMonth = Number(monthRaw?.totalOrdered ?? 0);
    const orderedThisPreviousMonth = Number(previousMonthRaw?.totalOrdered ?? 0);
    const orderedValueThisMonth = this.parseAmount(monthRaw?.orderedValue);
    const orderedValuePreviousMonth = this.parseAmount(
      previousMonthRaw?.orderedValue,
    );
    const orderedValueThisYear = this.parseAmount(yearRaw?.orderedValueThisYear);
    const orderedValuePreviousYear = this.parseAmount(
      previousYearRaw?.orderedValuePreviousYear,
    );

    return {
      message: 'Order history summary fetched successfully',
      data: {
        activeDeliveries,
        orderedThisMonth,
        orderedValueThisMonth,
        totalMoney: this.parseAmount(lifetimeRaw?.totalMoney),
        totalOrderedValueThisYear: orderedValueThisYear,
        comparisonMetrics: {
          orderedThisMonthVsLastMonth: this.buildComparisonMetric(
            orderedThisMonth,
            orderedThisPreviousMonth,
            'last month',
          ),
          orderedValueThisMonthVsLastMonth: this.buildComparisonMetric(
            orderedValueThisMonth,
            orderedValuePreviousMonth,
            'last month',
          ),
          totalOrderedValueThisYearVsLastYear: this.buildComparisonMetric(
            orderedValueThisYear,
            orderedValuePreviousYear,
            'last year',
          ),
        },
      },
    };
  }

  async getMyPastOrders(userId: string, query: ListMyOrderHistoryQueryDto) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;
    const email = user.medicalEmail.trim().toLowerCase();

    const qb = this.ordersRepo
      .createQueryBuilder('o')
      .leftJoin('o.items', 'i')
      .where('LOWER(o.customerEmail) = :email', { email })
      .andWhere('o.type = :type', { type: OrderType.PRODUCT })
      .distinct(true);

    if (query.monthsBack) {
      const fromDate = new Date(
        new Date().getFullYear(),
        new Date().getMonth() - query.monthsBack,
        1,
        0,
        0,
        0,
        0,
      );
      qb.andWhere('o.createdAt >= :fromDate', { fromDate });
    }

    if (query.fulfillmentStatus) {
      qb.andWhere('o.fulfillmentStatus = :fulfillmentStatus', {
        fulfillmentStatus: query.fulfillmentStatus,
      });
    }

    if (query.paymentStatus) {
      qb.andWhere('o.paymentStatus = :paymentStatus', {
        paymentStatus: query.paymentStatus,
      });
    }

    if (query.search?.trim()) {
      const s = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere(
        new Brackets((subQb) => {
          subQb
            .where('LOWER(o.orderNumber) LIKE :s', { s })
            .orWhere('LOWER(i.productName) LIKE :s', { s })
            .orWhere('LOWER(i.sku) LIKE :s', { s });
        }),
      );
    }

    qb.orderBy('o.createdAt', 'DESC').skip(skip).take(limit);

    const [orders, total] = await qb.getManyAndCount();

    return {
      message: 'Past orders fetched successfully',
      data: {
        items: orders.map((order) => this.toMyOrderHistoryItem(order)),
        meta: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    };
  }

  async getMyPastOrderDetails(userId: string, id: string) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const email = user.medicalEmail.trim().toLowerCase();

    const order = await this.ordersRepo
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.items', 'items')
      .leftJoinAndSelect('o.timeline', 'timeline')
      .where('LOWER(o.customerEmail) = :email', { email })
      .andWhere('o.type = :type', { type: OrderType.PRODUCT })
      .andWhere(
        new Brackets((subQb) => {
          subQb.where('o.id = :id', { id }).orWhere('o.orderNumber = :id', {
            id,
          });
        }),
      )
      .getOne();

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const timeline = [...(order.timeline ?? [])].sort(
      (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
    );

    return {
      message: 'Order details fetched successfully',
      data: {
        ...this.toMyOrderHistoryItem(order),
        shippingAddress: {
          company: order.shippingCompany ?? null,
          attention: order.shippingAttention ?? null,
          addressLine1: order.shippingAddressLine1 ?? null,
          addressLine2: order.shippingAddressLine2 ?? null,
          city: order.shippingCity ?? null,
          state: order.shippingState ?? null,
          postalCode: order.shippingPostalCode ?? null,
          country: order.shippingCountry ?? null,
        },
        dispatch: {
          carrier: order.carrier ?? null,
          trackingNumber: order.trackingNumber ?? null,
          estimatedDeliveryDate: order.estimatedDeliveryDate ?? null,
          shippingNotes: order.shippingNotes ?? null,
        },
        timeline: timeline.map((event) => ({
          id: event.id,
          type: event.eventType,
          title: event.title,
          description: event.description ?? null,
          createdAt: event.createdAt,
        })),
      },
    };
  }

  async getMyOrderBreakdownByOrderNumber(userId: string, orderNumber: string) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const email = user.medicalEmail.trim().toLowerCase();
    const normalizedOrderNumber = this.normalizeOrderNumber(orderNumber);

    const order = await this.ordersRepo
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.items', 'items')
      .leftJoinAndSelect('o.timeline', 'timeline')
      .where('LOWER(o.customerEmail) = :email', { email })
      .andWhere('o.type = :type', { type: OrderType.PRODUCT })
      .andWhere('o.orderNumber = :orderNumber', {
        orderNumber: normalizedOrderNumber,
      })
      .getOne();

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const progress = this.getOrderProgressSnapshot(order.fulfillmentStatus);
    const itemDetails = (order.items ?? []).map((item) => ({
      id: item.id,
      productId: item.productId ?? null,
      name: item.productName,
      sku: item.sku ?? null,
      image: item.image ?? null,
      quantity: item.quantity,
      unitPrice: this.parseAmount(item.unitPrice),
      lineTotal: this.parseAmount(item.total),
    }));

    return {
      message: 'Order breakdown fetched successfully',
      data: {
        orderId: `#${order.orderNumber}`,
        orderedDate: order.createdAt,
        status: {
          paymentStatus: order.paymentStatus,
          fulfillmentStatus: order.fulfillmentStatus,
          currentStep: progress.current,
          nextStep: progress.next,
          nextSteps: progress.nextSteps,
          allSteps: progress.allSteps,
        },
        totals: {
          totalItems: itemDetails.length,
          totalQuantity: itemDetails.reduce((sum, item) => sum + item.quantity, 0),
          subtotal: this.parseAmount(order.subtotal),
          shipping: this.parseAmount(order.shippingAmount),
          tax: this.parseAmount(order.taxAmount),
          grandTotal: this.parseAmount(order.grandTotal),
        },
        itemDetails,
        shippingTo: {
          fullName: order.shippingAttention ?? order.customerName ?? null,
          company: order.shippingCompany ?? null,
          addressLine1: order.shippingAddressLine1 ?? null,
          addressLine2: order.shippingAddressLine2 ?? null,
          city: order.shippingCity ?? null,
          state: order.shippingState ?? null,
          postalCode: order.shippingPostalCode ?? null,
          country: order.shippingCountry ?? null,
          phone: order.customerPhone ?? null,
        },
      },
    };
  }

  async getMyShippingAddress(userId: string) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const savedAddress = this.getUserShippingAddress(user);
    const payload = savedAddress
      ? savedAddress
      : {
          fullName: user.fullLegalName ?? '',
          addressLine1: '',
          addressLine2: '',
          city: '',
          state: '',
          zipCode: '',
          country: 'US',
        };

    const isComplete = Boolean(
      payload.fullName &&
        payload.addressLine1 &&
        payload.city &&
        payload.state &&
        payload.zipCode,
    );

    return {
      message: 'Shipping address fetched successfully',
      data: {
        ...payload,
        isComplete,
      },
    };
  }

  async updateMyShippingAddress(userId: string, dto: ShippingAddressDto) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const address = this.normalizeShippingAddress(dto);
    this.validateShippingAddress(address);

    user.shippingFullName = address.fullName;
    user.shippingAddressLine1 = address.addressLine1;
    user.shippingAddressLine2 = address.addressLine2;
    user.shippingCity = address.city;
    user.shippingState = address.state;
    user.shippingPostalCode = address.zipCode;
    user.shippingCountry = address.country || 'US';

    const saved = await this.usersRepo.save(user);

    return {
      message: 'Shipping address updated successfully',
      data: {
        fullName: saved.shippingFullName,
        addressLine1: saved.shippingAddressLine1,
        addressLine2: saved.shippingAddressLine2,
        city: saved.shippingCity,
        state: saved.shippingState,
        zipCode: saved.shippingPostalCode,
        country: saved.shippingCountry || 'US',
        isComplete: true,
      },
    };
  }

  async createStripeCheckoutSession(
    userId: string,
    dto: CreateCheckoutSessionDto,
  ) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const summary = await this.buildPublicOrderSummary(dto.items);

    const requestAddress = dto.shippingAddress
      ? this.normalizeShippingAddress(dto.shippingAddress)
      : null;
    const shippingAddress = requestAddress ?? this.getUserShippingAddress(user);
    this.validateShippingAddress(shippingAddress);

    if (requestAddress) {
      user.shippingFullName = requestAddress.fullName;
      user.shippingAddressLine1 = requestAddress.addressLine1;
      user.shippingAddressLine2 = requestAddress.addressLine2;
      user.shippingCity = requestAddress.city;
      user.shippingState = requestAddress.state;
      user.shippingPostalCode = requestAddress.zipCode;
      user.shippingCountry = requestAddress.country || 'US';
      await this.usersRepo.save(user);
    }

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

    const stripe = Stripe(stripeSecretKey);

    const lineItems =
      summary.items.map((item) => ({
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
      customer_email: user.medicalEmail,
      line_items: lineItems,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        userId,
        shippingFullName: shippingAddress.fullName,
        shippingAddressLine1: shippingAddress.addressLine1,
        shippingAddressLine2: shippingAddress.addressLine2 || '',
        shippingCity: shippingAddress.city,
        shippingState: shippingAddress.state,
        shippingPostalCode: shippingAddress.zipCode,
        shippingCountry: shippingAddress.country || 'US',
      },
    });

    return {
      message: 'Stripe checkout session created successfully',
      data: {
        sessionId: session.id,
        checkoutUrl: session.url,
        shippingAddress,
        orderSummary: this.toPublicSummaryResponse(summary),
      },
    };
  }

  async getSummary() {
    const revenueRaw = await this.ordersRepo
      .createQueryBuilder('o')
      .select(
        `COALESCE(SUM(CASE WHEN o.paymentStatus = :paid THEN o.grandTotal ELSE 0 END), 0)`,
        'revenue',
      )
      .setParameter('paid', PaymentStatus.PAID)
      .getRawOne();

    const ordersCount = await this.ordersRepo.count();

    const toBeShipped = await this.ordersRepo.count({
      where: {
        paymentStatus: PaymentStatus.PAID,
        fulfillmentStatus: FulfillmentStatus.UNFULFILLED,
      },
    });

    const avgRaw = await this.ordersRepo
      .createQueryBuilder('o')
      .select('COALESCE(AVG(o.grandTotal), 0)', 'avg')
      .getRawOne();

    return {
      cards: {
        thisMonthRevenue: Number(revenueRaw?.revenue ?? 0),
        totalOrders: ordersCount,
        toBeShipped,
        avgOrderValue: Number(avgRaw?.avg ?? 0),
      },
    };
  }

  async findAll(query: ListOrdersQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const qb = this.ordersRepo.createQueryBuilder('o');

    if (query.search?.trim()) {
      const s = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere(
        `(
          LOWER(o.orderNumber) LIKE :s
          OR LOWER(o.customerName) LIKE :s
          OR LOWER(o.customerEmail) LIKE :s
        )`,
        { s },
      );
    }

    if (query.type) {
      qb.andWhere('o.type = :type', { type: query.type });
    }

    if (query.paymentStatus) {
      qb.andWhere('o.paymentStatus = :paymentStatus', {
        paymentStatus: query.paymentStatus,
      });
    }

    if (query.fulfillmentStatus) {
      qb.andWhere('o.fulfillmentStatus = :fulfillmentStatus', {
        fulfillmentStatus: query.fulfillmentStatus,
      });
    }

    qb.orderBy('o.createdAt', 'DESC');
    qb.skip(skip).take(limit);

    const total = await qb.getCount();
    const rows = await qb.getMany();

    const items = rows.map((o) => ({
      id: o.id,
      orderId: o.orderNumber,
      date: o.createdAt,
      customer: {
        name: o.customerName,
        email: o.customerEmail,
        avatar: o.customerAvatar ?? null,
      },
      type: o.type,
      paymentStatus: o.paymentStatus,
      fulfillment: o.fulfillmentStatus,
      total: o.grandTotal,
    }));

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const order = await this.ordersRepo.findOne({
      where: [{ id }, { orderNumber: id }],
      relations: ['items', 'timeline'],
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const timeline = [...(order.timeline ?? [])].sort(
      (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
    );

    return {
      id: order.id,
      orderId: order.orderNumber,
      placedAt: order.createdAt,

      paymentStatus: order.paymentStatus,
      fulfillmentStatus: order.fulfillmentStatus,

      customer: {
        name: order.customerName,
        email: order.customerEmail,
        phone: order.customerPhone,
        avatar: order.customerAvatar ?? null,
        shippingAddress: {
          company: order.shippingCompany,
          attention: order.shippingAttention,
          addressLine1: order.shippingAddressLine1,
          addressLine2: order.shippingAddressLine2,
          city: order.shippingCity,
          state: order.shippingState,
          postalCode: order.shippingPostalCode,
          country: order.shippingCountry,
        },
      },

      items: (order.items ?? []).map((item) => ({
        id: item.id,
        productId: item.productId,
        name: item.productName,
        sku: item.sku,
        image: item.image,
        price: item.unitPrice,
        quantity: item.quantity,
        total: item.total,
      })),

      summary: {
        subtotal: order.subtotal,
        shipping: order.shippingAmount,
        tax: order.taxAmount,
        grandTotal: order.grandTotal,
      },

      dispatch: {
        carrier: order.carrier,
        trackingNumber: order.trackingNumber,
        estimatedDeliveryDate: order.estimatedDeliveryDate,
        shippingNotes: order.shippingNotes,
      },

      timeline: timeline.map((event) => ({
        id: event.id,
        type: event.eventType,
        title: event.title,
        description: event.description,
        createdAt: event.createdAt,
      })),
    };
  }

  async updateDispatch(id: string, dto: UpdateOrderDispatchDto) {
    const order = await this.ordersRepo.findOne({ where: { id } });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (dto.carrier !== undefined) order.carrier = dto.carrier;
    if (dto.trackingNumber !== undefined)
      order.trackingNumber = dto.trackingNumber;
    if (dto.estimatedDeliveryDate !== undefined) {
      order.estimatedDeliveryDate = new Date(dto.estimatedDeliveryDate);
    }
    if (dto.shippingNotes !== undefined)
      order.shippingNotes = dto.shippingNotes;
    if (dto.fulfillmentStatus !== undefined) {
      order.fulfillmentStatus = dto.fulfillmentStatus;
    }

    const saved = await this.ordersRepo.save(order);

    if (dto.fulfillmentStatus === FulfillmentStatus.SHIPPED) {
      await this.timelineRepo.save(
        this.timelineRepo.create({
          orderId: order.id,
          eventType: TimelineEventType.ORDER_SHIPPED,
          title: 'Order Shipped',
          description: dto.trackingNumber
            ? `Tracking number: ${dto.trackingNumber}`
            : undefined,
        }),
      );
    }

    if (dto.fulfillmentStatus === FulfillmentStatus.RECEIVED) {
      await this.timelineRepo.save(
        this.timelineRepo.create({
          orderId: order.id,
          eventType: TimelineEventType.ORDER_RECEIVED,
          title: 'Order Received',
        }),
      );
    }

    return this.findOne(saved.id);
  }

  async refund(id: string, dto: RefundOrderDto) {
    const order = await this.ordersRepo.findOne({ where: { id } });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.paymentStatus !== PaymentStatus.PAID) {
      throw new BadRequestException('Only paid orders can be refunded');
    }

    order.paymentStatus = PaymentStatus.REFUNDED;
    order.fulfillmentStatus = FulfillmentStatus.CLOSED;

    await this.ordersRepo.save(order);

    await this.timelineRepo.save(
      this.timelineRepo.create({
        orderId: order.id,
        eventType: TimelineEventType.ORDER_REFUNDED,
        title: 'Order Refunded',
        description: dto.reason?.trim() || undefined,
      }),
    );

    return this.findOne(order.id);
  }

  async updateStatus(id: string, dto: UpdateOrderStatusDto) {
    const order = await this.ordersRepo.findOne({ where: { id } });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (dto.fromStatus && order.fulfillmentStatus !== dto.fromStatus) {
      throw new BadRequestException(
        `Current status mismatch. Expected ${dto.fromStatus} but found ${order.fulfillmentStatus}`,
      );
    }

    const validNextMap: Record<FulfillmentStatus, FulfillmentStatus[]> = {
      [FulfillmentStatus.UNFULFILLED]: [
        FulfillmentStatus.PROCESSING,
        FulfillmentStatus.CLOSED,
      ],
      [FulfillmentStatus.PROCESSING]: [
        FulfillmentStatus.SHIPPED,
        FulfillmentStatus.CLOSED,
      ],
      [FulfillmentStatus.SHIPPED]: [
        FulfillmentStatus.RECEIVED,
        FulfillmentStatus.CLOSED,
      ],
      [FulfillmentStatus.RECEIVED]: [FulfillmentStatus.CLOSED],
      [FulfillmentStatus.CLOSED]: [],
    };

    const allowedNext = validNextMap[order.fulfillmentStatus] ?? [];
    if (
      !allowedNext.includes(dto.toStatus) &&
      dto.toStatus !== order.fulfillmentStatus
    ) {
      throw new BadRequestException(
        `Invalid status transition from ${order.fulfillmentStatus} to ${dto.toStatus}`,
      );
    }

    order.fulfillmentStatus = dto.toStatus;
    const saved = await this.ordersRepo.save(order);

    const eventTypeMap: Partial<Record<FulfillmentStatus, TimelineEventType>> =
      {
        [FulfillmentStatus.PROCESSING]: TimelineEventType.PROCESSING_STARTED,
        [FulfillmentStatus.SHIPPED]: TimelineEventType.ORDER_SHIPPED,
        [FulfillmentStatus.RECEIVED]: TimelineEventType.ORDER_RECEIVED,
      };

    const titleMap: Partial<Record<FulfillmentStatus, string>> = {
      [FulfillmentStatus.PROCESSING]: 'Order Processing Started',
      [FulfillmentStatus.SHIPPED]: 'Order Shipped',
      [FulfillmentStatus.RECEIVED]: 'Order Received',
      [FulfillmentStatus.CLOSED]: 'Order Closed',
    };

    const timelineEvent = await this.timelineRepo.save(
      this.timelineRepo.create({
        orderId: order.id,
        eventType: eventTypeMap[dto.toStatus] ?? TimelineEventType.ORDER_PLACED,
        title: titleMap[dto.toStatus] ?? 'Order Status Updated',
        description: dto.note?.trim() || undefined,
      }),
    );

    return {
      message: 'Order status updated successfully',
      order: {
        id: saved.id,
        orderId: saved.orderNumber,
        paymentStatus: saved.paymentStatus,
        fulfillmentStatus: saved.fulfillmentStatus,
        updatedAt: saved.updatedAt,
      },
      timelineEvent: {
        type: timelineEvent.eventType,
        title: timelineEvent.title,
        description: timelineEvent.description ?? null,
        createdAt: timelineEvent.createdAt,
      },
    };
  }

  async generateShippingLabelMeta(id: string, dto: PrintShippingLabelDto) {
    const order = await this.ordersRepo.findOne({ where: { id } });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return {
      message: 'Shipping label generated successfully',
      orderId: order.orderNumber,
      label: {
        downloadUrl: `/admin/orders/${order.id}/labels/print?download=1`,
        previewUrl: `/admin/orders/${order.id}/labels/print`,
        labelFormat: dto.labelFormat ?? '4x6',
        orientation: dto.orientation ?? 'portrait',
        includePackingSlip: dto.includePackingSlip ?? false,
        printInstructions: dto.printInstructions ?? false,
      },
    };
  }

  async buildShippingLabelPdf(id: string): Promise<Buffer> {
    const order = await this.ordersRepo.findOne({
      where: { id },
      relations: ['items'],
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const trackingNumber =
      order.trackingNumber?.trim() ||
      `TRK-${order.orderNumber.replace(/[^A-Za-z0-9]/g, '')}`;

    const barcodePng = await bwipjs.toBuffer({
      bcid: 'code128',
      text: trackingNumber,
      scale: 3,
      height: 12,
      includetext: true,
      textxalign: 'center',
    });

    const qrPayload = JSON.stringify({
      orderId: order.orderNumber,
      trackingNumber,
      customer: order.customerName,
      email: order.customerEmail,
    });

    const qrPng = await QRCode.toBuffer(qrPayload, {
      width: 140,
      margin: 1,
      errorCorrectionLevel: 'M',
    });

    const chunks: Buffer[] = [];

    const doc = new PDFDocument({
      size: [288, 432], // 4x6 inch at 72dpi
      margin: 16,
    });

    doc.on('data', (chunk) => chunks.push(chunk));
    const endPromise = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    doc.rect(0, 0, 288, 432).fill('#FFFFFF');
    doc.fillColor('#000000');

    doc.fontSize(18).font('Helvetica-Bold').text('TAI', 20, 18);
    doc.fontSize(8).font('Helvetica-Bold').text('TEXAS AIRWAY', 20, 38);
    doc.fontSize(8).font('Helvetica-Bold').text('INSTITUTE', 20, 48);

    doc.fontSize(18).font('Helvetica-Bold').text('FedEx', 200, 18, {
      width: 60,
      align: 'right',
    });
    doc.fontSize(8).font('Helvetica').text('Standard Overnight', 172, 38, {
      width: 88,
      align: 'right',
    });

    doc.moveTo(20, 70).lineTo(268, 70).stroke('#000000');

    doc.fontSize(8).font('Helvetica-Bold').text('SHIP FROM:', 20, 80);
    doc
      .fontSize(8)
      .font('Helvetica')
      .text(
        `Texas Airway Institute\n1200 Medical Center Blvd\nHouston, TX 77030`,
        20,
        95,
      );

    doc.fontSize(8).font('Helvetica-Bold').text('SHIP TO:', 20, 155);
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .text(order.customerName.toUpperCase(), 20, 172);

    const shipToLines = [
      order.shippingAddressLine1,
      order.shippingAddressLine2,
      [order.shippingCity, order.shippingState, order.shippingPostalCode]
        .filter(Boolean)
        .join(', '),
      order.shippingCountry,
    ].filter(Boolean);

    doc.fontSize(8).font('Helvetica').text(shipToLines.join('\n'), 20, 190);

    doc.image(barcodePng, 55, 245, { width: 180, height: 45 });

    doc.fontSize(8).font('Helvetica-Bold').text(trackingNumber, 20, 295, {
      width: 248,
      align: 'center',
    });

    doc.rect(20, 330, 52, 52).stroke('#000000');
    doc.image(qrPng, 26, 336, { width: 40, height: 40 });

    doc.fontSize(24).font('Helvetica-Bold').text('A1', 210, 336);

    const totalWeight = order.items?.length
      ? `${order.items.length * 1.25} LBS`
      : '1.25 LBS';
    doc
      .fontSize(7)
      .font('Helvetica-Bold')
      .text(`REF: CLINICAL GEAR 01\nWGT: ${totalWeight}`, 165, 360, {
        width: 90,
        align: 'right',
      });

    doc.moveTo(20, 394).lineTo(268, 394).stroke('#000000');
    doc
      .fontSize(9)
      .font('Helvetica-Bold')
      .text('STANDARD OVERNIGHT - MEDICAL PRIORITY', 20, 405, {
        width: 248,
        align: 'center',
      });

    doc.end();
    return endPromise;
  }
}
