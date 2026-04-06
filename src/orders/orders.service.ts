import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from './entities/order.entity';
import { OrderTimeline } from './entities/order-timeline.entity';
import {
  FulfillmentStatus,
  PaymentStatus,
  TimelineEventType,
} from 'src/common/enums/order.enums';
import { ListOrdersQueryDto } from './dto/list-orders.query.dto';
import { UpdateOrderDispatchDto } from './dto/update-order-dispatch.dto';
import { RefundOrderDto } from './dto/refund-order.dto';
import { PrintShippingLabelDto } from './dto/print-shipping-label.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import PDFDocument from 'pdfkit';
import * as bwipjs from 'bwip-js';
import * as QRCode from 'qrcode';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly ordersRepo: Repository<Order>,
    @InjectRepository(OrderTimeline)
    private readonly timelineRepo: Repository<OrderTimeline>,
  ) {}

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
