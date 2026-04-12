import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets } from 'typeorm';
import { Order } from './entities/order.entity';
import { FulfillmentStatus } from 'src/common/enums/order.enums';

@Injectable()
export class PrivateOrderService {
  constructor(
    @InjectRepository(Order)
    private readonly ordersRepo: Repository<Order>,
  ) {}

  // ── 1. GET ORDER SUMMARY (Top 4 Cards on List Page) ──
  async getOrderSummary(userEmail: string) {
    const allOrders = await this.ordersRepo.find({
      where: { customerEmail: userEmail },
    });

    const now = new Date();

    // Time Boundaries for Comparisons
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const startOfThisYear = new Date(now.getFullYear(), 0, 1);
    const startOfLastYear = new Date(now.getFullYear() - 1, 0, 1);

    // Current Period Variables
    let activeDeliveries = 0;
    let orderedThisMonthCount = 0;
    let orderValueThisMonth = 0;
    let totalOrderedValue = 0;

    // Previous Period Variables
    let activeDeliveriesLastMonth = 0;
    let orderedLastMonthCount = 0;
    let orderValueLastMonth = 0;
    let totalOrderedValueLastYear = 0;

    allOrders.forEach((order) => {
      const grandTotal = parseFloat(order.grandTotal) || 0;
      totalOrderedValue += grandTotal;

      const orderDate = new Date(order.createdAt);
      const isClosed = order.fulfillmentStatus === FulfillmentStatus.CLOSED;

      // ── Metrics: Active Deliveries ──
      if (!isClosed) {
        activeDeliveries++;
      }

      // To calculate "Active Deliveries vs Last Month", we need to know how many were active AT THIS TIME last month.
      // For simplicity in a dynamic system, we can approximate this by looking at orders placed last month that are STILL active,
      // OR count how many orders were placed last month vs this month.
      // Let's use orders placed last month as a proxy for the trend base:
      if (
        orderDate >= startOfLastMonth &&
        orderDate < startOfThisMonth &&
        !isClosed
      ) {
        activeDeliveriesLastMonth++;
      }

      // ── Metrics: Monthly Orders & Value ──
      if (orderDate >= startOfThisMonth) {
        // Current Month
        orderedThisMonthCount++;
        orderValueThisMonth += grandTotal;
      } else if (
        orderDate >= startOfLastMonth &&
        orderDate < startOfThisMonth
      ) {
        // Last Month
        orderedLastMonthCount++;
        orderValueLastMonth += grandTotal;
      }

      // ── Metrics: Yearly Value ──
      if (orderDate >= startOfLastYear && orderDate < startOfThisYear) {
        totalOrderedValueLastYear += grandTotal;
      }
    });

    // Calculate "Total Ordered Value" for the CURRENT year (to compare against last year)
    const totalOrderedValueThisYear = allOrders
      .filter((o) => new Date(o.createdAt) >= startOfThisYear)
      .reduce((sum, o) => sum + (parseFloat(o.grandTotal) || 0), 0);

    // ── Trend Calculation Helpers ──
    const calculateTrend = (
      current: number,
      previous: number,
      suffix: string,
    ) => {
      if (previous === 0) {
        return current > 0 ? `+ 100% ${suffix}` : `0% ${suffix}`; // Avoid division by zero
      }
      const percentage = ((current - previous) / previous) * 100;
      const sign = percentage > 0 ? '+' : '';
      return `${sign} ${percentage.toFixed(1)}% ${suffix}`;
    };

    const activeTrend = calculateTrend(
      activeDeliveries,
      activeDeliveriesLastMonth,
      'vs last month',
    );
    const countTrend = calculateTrend(
      orderedThisMonthCount,
      orderedLastMonthCount,
      'vs last month',
    );
    const valueTrend = calculateTrend(
      orderValueThisMonth,
      orderValueLastMonth,
      'vs last month',
    );

    // The UI specifically says "vs last year" for the total ordered value.
    // We compare this year's total so far against last year's total.
    const totalTrend = calculateTrend(
      totalOrderedValueThisYear,
      totalOrderedValueLastYear,
      'vs last year',
    );

    return {
      message: 'Order summary retrieved successfully',
      data: {
        activeDeliveries: {
          value: activeDeliveries,
          trend: activeTrend,
        },
        orderedThisMonth: {
          value: orderedThisMonthCount,
          trend: countTrend,
        },
        orderValueMonth: {
          value: orderValueThisMonth.toFixed(2),
          trend: valueTrend,
        },
        totalOrderedValue: {
          value: totalOrderedValue.toFixed(2),
          trend: totalTrend,
        },
      },
    };
  }

  // ── 2. GET ORDER HISTORY LIST (With Search, Filter, Pagination) ──
  async getOrderHistory(userEmail: string, query: any) {
    const limit = Number(query.limit) || 10;
    const page = Number(query.page) || 1;
    const skip = (page - 1) * limit;

    const qb = this.ordersRepo
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.items', 'items')
      .where('o.customerEmail = :email', { email: userEmail })
      .orderBy('o.createdAt', 'DESC');

    // Apply Status Filter
    if (query.status) {
      qb.andWhere('o.fulfillmentStatus = :status', { status: query.status });
    }

    // Apply Search Filter (Order Number, Product Name, SKU)
    if (query.search) {
      const searchTerm = `%${query.search}%`;
      qb.andWhere(
        new Brackets((sqb) => {
          sqb
            .where('o.orderNumber ILIKE :search', { search: searchTerm })
            .orWhere('items.productName ILIKE :search', { search: searchTerm })
            .orWhere('items.sku ILIKE :search', { search: searchTerm });
        }),
      );
    }

    const [orders, total] = await qb.skip(skip).take(limit).getManyAndCount();

    const mappedOrders = orders.map((order) => {
      const leadItem =
        order.items && order.items.length > 0 ? order.items[0] : null;
      const extraItemsCount = order.items ? order.items.length - 1 : 0;
      const totalQuantity = order.items
        ? order.items.reduce((acc, item) => acc + item.quantity, 0)
        : 0;

      // Map DB fulfillment status to UI status format
      let displayStatus = order.fulfillmentStatus.toString().toLowerCase();
      if (displayStatus === 'unfulfilled') displayStatus = 'processing';
      if (displayStatus === 'closed') displayStatus = 'delivered';

      return {
        id: order.id,
        orderNumber: order.orderNumber,
        dateOrdered: order.createdAt.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }),
        status: displayStatus,
        totalAmount: parseFloat(order.grandTotal).toFixed(2),
        totalItemsCount: totalQuantity,
        leadItem: leadItem
          ? {
              title: leadItem.productName,
              sku: leadItem.sku,
              imageUrl: leadItem.image,
              extraItemsText:
                extraItemsCount > 0 ? `+ ${extraItemsCount} other items` : null,
              badgeText:
                extraItemsCount > 0
                  ? `+${extraItemsCount + 1} items`
                  : '1 item',
            }
          : null,
        actions: {
          view: `/dashboard/orders/${order.id}`,
          invoice: `/api/orders/${order.id}/invoice`,
          reorder: `/cart?reorderFrom=${order.id}`,
        },
      };
    });

    return {
      message: 'Order history retrieved successfully',
      data: mappedOrders,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ── 3. GET SINGLE ORDER DETAILS (Timeline, Items, Shipping, Payment) ──
  async getOrderDetails(userEmail: string, orderId: string) {
    const order = await this.ordersRepo.findOne({
      where: { id: orderId, customerEmail: userEmail },
      relations: ['items', 'timeline'],
    });

    if (!order) throw new NotFoundException('Order not found or access denied');

    // Step 1: Map Timeline events from DB
    const timelineMap = new Map<string, Date>();
    if (order.timeline) {
      order.timeline.forEach((event) => {
        // Storing the earliest date for each event type
        if (!timelineMap.has(event.eventType)) {
          timelineMap.set(event.eventType, event.createdAt);
        }
      });
    }

    // Determine UI timeline state based on DB fulfillment status
    const statusStr = order.fulfillmentStatus.toString().toUpperCase();
    let currentStepIndex = 0; // Ordered
    let statusLabel = 'Order Received';

    if (statusStr === 'PROCESSING' || statusStr === 'UNFULFILLED') {
      currentStepIndex = 1;
      statusLabel = 'Processing Your Order';
    } else if (statusStr === 'SHIPPED') {
      currentStepIndex = 2;
      statusLabel = 'In Transit';
    } else if (statusStr === 'CLOSED') {
      currentStepIndex = 3;
      statusLabel = 'Delivered';
    }

    // Build the 4 standard UI steps
    const orderedDate = order.createdAt;
    const processingDate = timelineMap.get('PROCESSING' as any); // Adapt to your exact enum
    const shippedDate = timelineMap.get('SHIPPED' as any);
    const deliveredDate =
      timelineMap.get('DELIVERED' as any) || order.estimatedDeliveryDate;

    const formatDt = (dt?: Date) =>
      dt
        ? dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : 'PENDING';

    const timelineSteps = [
      { key: 'ordered', label: 'Ordered', date: formatDt(orderedDate) },
      {
        key: 'processing',
        label: 'Processing',
        date:
          currentStepIndex >= 1
            ? formatDt(processingDate || orderedDate)
            : 'NEXT UP',
      },
      {
        key: 'shipped',
        label: 'Shipped',
        date: currentStepIndex >= 2 ? formatDt(shippedDate) : 'PENDING',
      },
      {
        key: 'delivered',
        label: 'Delivered',
        date: currentStepIndex === 3 ? formatDt(deliveredDate) : 'PENDING',
      },
    ];

    // Build Response strictly from Entity fields
    return {
      message: 'Order details retrieved successfully',
      data: {
        id: order.id,
        orderNumber: order.orderNumber,
        placedDate: order.createdAt.toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        }),
        actions: {
          downloadInvoice: `/api/orders/${order.id}/invoice`,
          trackPackage: order.trackingNumber
            ? `https://tracking.com/${order.trackingNumber}`
            : null,
          reorderAll: `/cart?reorderFrom=${order.id}`,
        },
        shipmentStatus: {
          statusLabel: statusLabel,
          carrier: order.carrier || 'Not Assigned',
          trackingNumber: order.trackingNumber || 'Pending',
          estimatedDelivery: order.estimatedDeliveryDate
            ? order.estimatedDeliveryDate.toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'short',
                day: 'numeric',
              })
            : 'Pending Shipment',
        },
        timeline: {
          currentStepIndex,
          steps: timelineSteps,
        },
        items: (order.items || []).map((item) => ({
          id: item.productId,
          name: item.productName,
          sku: item.sku || 'N/A',
          imageUrl: item.image || null,
          price: parseFloat(item.unitPrice).toFixed(2),
          quantity: item.quantity,
          // DB entity does not have attributes JSON, so we return null to strictly follow DB schema without mocking
          attributes: null,
          buyAgainUrl: item.productId
            ? `/store/products/${item.productId}`
            : null,
        })),
        shipping: {
          fullName: order.customerName, // From entity
          addressLine1: order.shippingAddressLine1 || '',
          addressLine2: order.shippingAddressLine2 || null,
          cityStateZip: [
            order.shippingCity,
            order.shippingState,
            order.shippingPostalCode,
          ]
            .filter(Boolean)
            .join(', '),
        },
        payment: {
          // No card info in entity, sending null so frontend knows to hide it or show "Paid"
          brand: null,
          last4: null,
          subtotal: parseFloat(order.subtotal).toFixed(2),
          shipping: parseFloat(order.shippingAmount).toFixed(2),
          tax: parseFloat(order.taxAmount).toFixed(2),
          grandTotal: parseFloat(order.grandTotal).toFixed(2),
        },
      },
    };
  }
}
