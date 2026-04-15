import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

// Replace these with your actual entity imports
import { Order } from 'src/orders/entities/order.entity';
import { OrderItem } from 'src/orders/entities/order-item.entity';
import { User } from 'src/users/entities/user.entity';
import { WorkshopEnrollment } from 'src/workshops/entities/workshop-enrollment.entity';

import {
  AnalyticsQueryDto,
  PopularCoursesQueryDto,
  RevenueChartQueryDto,
  TopProductsQueryDto,
} from './dto/analytics-query.dto';
import { OrderType, PaymentStatus } from 'src/common/enums/order.enums';
import {
  OrderSummaryStatus,
  WorkshopOrderSummary,
} from 'src/workshops/entities/workshop-order-summary.entity';
import { Product } from 'src/products/entities/product.entity';
import { Workshop } from 'src/workshops/entities/workshop.entity';
import { PopularCoursesMetricsResponse } from 'src/common/interfaces/response.interface';
import { CourseProgressStatus } from 'src/workshops/entities/course-progress-status.enum';
import {
  ReservationStatus,
  WorkshopReservation,
} from 'src/workshops/entities/workshop-reservation.entity';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepo: Repository<OrderItem>,
    @InjectRepository(WorkshopEnrollment)
    private readonly enrollmentRepo: Repository<WorkshopEnrollment>,
    @InjectRepository(WorkshopOrderSummary)
    private readonly workshopOrderSummaryRepo: Repository<WorkshopOrderSummary>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(Workshop)
    private readonly workshopRepo: Repository<Workshop>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(WorkshopReservation)
    private readonly workshopReservationRepo: Repository<WorkshopReservation>,
  ) {}

  private getDateRanges(query: AnalyticsQueryDto) {
    const isAllTime = !query.startDate && !query.endDate;

    const end = query.endDate ? new Date(query.endDate) : new Date();
    const start = query.startDate
      ? new Date(query.startDate)
      : new Date(new Date().setDate(end.getDate() - 30));

    const diffTime = Math.abs(end.getTime() - start.getTime());
    const prevEnd = new Date(start.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - diffTime);

    return { start, end, prevStart, prevEnd, isAllTime };
  }

  private calculateGrowth(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Number((((current - previous) / previous) * 100).toFixed(1));
  }

  // ────────────────── MAIN METRICS SUMMARY ──────────────────
  async getSummaryMetrics(
    query: AnalyticsQueryDto,
  ): Promise<Record<string, unknown>> {
    const { start, end, prevStart, prevEnd, isAllTime } =
      this.getDateRanges(query);

    const getRevenue = async (s: Date, e: Date) => {
      const qb1 = this.orderRepo
        .createQueryBuilder('ord')
        .select('SUM(ord.grandTotal)', 'total')
        .where('ord.paymentStatus = :status', { status: PaymentStatus.PAID })
        .andWhere('ord.type = :type', { type: OrderType.PRODUCT });

      const qb2 = this.workshopOrderSummaryRepo
        .createQueryBuilder('wos')
        .select('SUM(wos.totalPrice)', 'total')
        .where('wos.status = :status', {
          status: OrderSummaryStatus.COMPLETED,
        });

      if (!isAllTime) {
        qb1.andWhere('ord.createdAt BETWEEN :s AND :e', { s, e });
        qb2.andWhere('wos.createdAt BETWEEN :s AND :e', { s, e });
      }

      const prodRes = await qb1.getRawOne();
      const courseRes = await qb2.getRawOne();
      return Number(prodRes?.total || 0) + Number(courseRes?.total || 0);
    };

    const getStudents = async (s: Date, e: Date) => {
      const qb = this.enrollmentRepo
        .createQueryBuilder('enrollment')
        .select('COUNT(DISTINCT enrollment.userId)', 'total');
      if (!isAllTime)
        qb.where('enrollment.createdAt BETWEEN :s AND :e', { s, e });
      const res = await qb.getRawOne();
      return Number(res?.total || 0);
    };

    // Calculate (Mocked Profit and Conversion for now due to DB schema limits)
    const currRev = await getRevenue(start, end);
    const prevRev = await getRevenue(prevStart, prevEnd);
    const currStudents = await getStudents(start, end);
    const prevStudents = await getStudents(prevStart, prevEnd);

    return {
      totalRevenue: {
        value: currRev,
        growthRatePercent: this.calculateGrowth(currRev, prevRev),
      },
      totalStudents: {
        value: currStudents,
        growthRatePercent: this.calculateGrowth(currStudents, prevStudents),
      },
    };
  }

  // ────────────────── TOP SELLING PRODUCTS ──────────────────
  // ────────────────── TOP SELLING PRODUCTS ──────────────────
  async getTopProductsMetrics(
    query: TopProductsQueryDto,
  ): Promise<Record<string, unknown>> {
    const { start, end, isAllTime } = this.getDateRanges(query);

    // 1. Total Products Sold
    const qbTotal = this.orderItemRepo
      .createQueryBuilder('item')
      .innerJoin('item.order', 'ord')
      .select('SUM(item.quantity)', 'total')
      .where('ord.paymentStatus = :status', { status: PaymentStatus.PAID })
      .andWhere('ord.type = :type', { type: OrderType.PRODUCT });
    if (!isAllTime)
      qbTotal.andWhere('ord.createdAt BETWEEN :s AND :e', { s: start, e: end });
    const totalSalesRes = await qbTotal.getRawOne();

    // 2. Average Order Value (AOV)
    const qbAov = this.orderRepo
      .createQueryBuilder('ord')
      .select('AVG(ord.grandTotal)', 'avg')
      .where('ord.paymentStatus = :status', { status: PaymentStatus.PAID })
      .andWhere('ord.type = :type', { type: OrderType.PRODUCT });
    if (!isAllTime)
      qbAov.andWhere('ord.createdAt BETWEEN :s AND :e', { s: start, e: end });
    const aovRes = await qbAov.getRawOne();

    // 3. Return Rate (Refunded Orders / Total Orders * 100)
    const qbRefunds = this.orderRepo
      .createQueryBuilder('ord')
      .select('COUNT(ord.id)', 'count')
      .where('ord.paymentStatus = :status', { status: PaymentStatus.REFUNDED })
      .andWhere('ord.type = :type', { type: OrderType.PRODUCT });
    if (!isAllTime)
      qbRefunds.andWhere('ord.createdAt BETWEEN :s AND :e', {
        s: start,
        e: end,
      });
    const refundsRes = await qbRefunds.getRawOne();

    const qbAllOrders = this.orderRepo
      .createQueryBuilder('ord')
      .select('COUNT(ord.id)', 'count')
      .where('ord.type = :type', { type: OrderType.PRODUCT });
    if (!isAllTime)
      qbAllOrders.andWhere('ord.createdAt BETWEEN :s AND :e', {
        s: start,
        e: end,
      });
    const allOrdersRes = await qbAllOrders.getRawOne();

    const totalRefunds = Number(refundsRes?.count || 0);
    const totalOrdersCount = Number(allOrdersRes?.count || 0);
    const returnRate =
      totalOrdersCount > 0 ? (totalRefunds / totalOrdersCount) * 100 : 0;

    return {
      totalProductsSold: Number(totalSalesRes?.total || 0),
      // activeListings: await this.productRepo.count(),
      // bestCategory: 'EQUIPMENT', // Note: 'product.category' column is missing in DB to group dynamically
      avgOrderValue: Number(Number(aovRes?.avg || 0).toFixed(2)),
      returnRate: Number(returnRate.toFixed(2)),
    };
  }

  // ────────────────── TOP SELLING PRODUCTS ──────────────────
  async getTopProducts(
    query: TopProductsQueryDto,
  ): Promise<Record<string, unknown>> {
    const { start, end, isAllTime } = this.getDateRanges(query);
    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const qb = this.orderItemRepo
      .createQueryBuilder('item')
      .innerJoin('item.order', 'ord')
      .select('item.productId', 'id')
      .addSelect('MAX(item.productName)', 'name') // Fetching directly from OrderItem
      .addSelect('MAX(item.sku)', 'sku') // Fetching directly from OrderItem
      .addSelect('MAX(item.image)', 'image') // Fetching directly from OrderItem
      .addSelect('SUM(item.quantity)', 'unitsSold')
      .addSelect('SUM(item.total)', 'revenue')
      .where('ord.paymentStatus = :status', { status: PaymentStatus.PAID })
      .andWhere('ord.type = :type', { type: OrderType.PRODUCT })
      .andWhere('item.productId IS NOT NULL');

    if (!isAllTime) {
      qb.andWhere('ord.createdAt BETWEEN :s AND :e', { s: start, e: end });
    }

    qb.groupBy('item.productId')
      .orderBy('revenue', 'DESC')
      .limit(limit)
      .offset(skip);

    const rawData = await qb.getRawMany();

    return {
      items: rawData.map((row, index) => ({
        rank: skip + index + 1,
        productDetails: {
          id: row.id,
          name: row.name || 'Unknown Product',
          image: row.image || null,
        },
        sku: row.sku || 'N/A',
        category: 'PRODUCT', // Fallback to prevent crash
        totalSales: Number(row.unitsSold || 0),
        revenue: Number(row.revenue || 0),
        trend: '+0%', // Default fallback
        stockStatus: 'In Stock', // Default fallback
      })),
      meta: { page, limit },
    };
  }

  async getPopularCoursesMetrics(
    query: PopularCoursesQueryDto,
  ): Promise<PopularCoursesMetricsResponse> {
    const totalEnrollmentsRaw = await this.workshopReservationRepo
      .createQueryBuilder('reservation')
      .select('COALESCE(SUM(reservation.numberOfSeats), 0)', 'total')
      .where('reservation.status = :status', {
        status: ReservationStatus.CONFIRMED, // Or 'confirmed'
      })
      .getRawOne();

    const totalEnrollments = Number(totalEnrollmentsRaw?.total || 0);

    const completedEnrollmentsRaw = await this.workshopReservationRepo
      .createQueryBuilder('reservation')
      .select('COALESCE(SUM(reservation.numberOfSeats), 0)', 'total')
      .where('reservation.status = :status', {
        status: ReservationStatus.CONFIRMED,
      })
      .andWhere('reservation.courseProgressStatus = :progressStatus', {
        progressStatus: CourseProgressStatus.COMPLETED, // Or 'completed'
      })
      .getRawOne();

    const completedEnrollments = Number(completedEnrollmentsRaw?.total || 0);

    const completionRate =
      totalEnrollments > 0
        ? Number(((completedEnrollments / totalEnrollments) * 100).toFixed(1))
        : 0;

    // ✅ FIX: Removed LOWER() entirely.
    // TypeORM and Postgres handle exact enum string matches perfectly without SQL functions.
    const activeInstructors = await this.usersRepo
      .createQueryBuilder('user')
      .where('user.role = :role', { role: 'instructor' })
      .andWhere('user.status = :status', { status: 'active' })
      .getCount();

    return {
      totalEnrollments,
      completionRate,
      activeInstructors,
    };
  }

  // ────────────────── MOST POPULAR COURSES ──────────────────
  async getPopularCourses(
    query: PopularCoursesQueryDto,
  ): Promise<Record<string, unknown>> {
    const { start, end, isAllTime } = this.getDateRanges(query);
    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const qb = this.workshopOrderSummaryRepo
      .createQueryBuilder('wos')
      .leftJoin('wos.workshop', 'w')
      .select('wos.workshopId', 'id')
      .addSelect('MAX(w.title)', 'name')
      .addSelect('SUM(wos.numberOfSeats)', 'enrolled')
      .addSelect('SUM(wos.totalPrice)', 'revenue')
      .where('wos.status = :status', { status: OrderSummaryStatus.COMPLETED });

    if (!isAllTime) {
      qb.andWhere('wos.createdAt BETWEEN :s AND :e', { s: start, e: end });
    }

    // safely removing problematic columns like instructorId, category, and type
    // to ensure the raw query doesn't crash.

    qb.groupBy('wos.workshopId')
      .orderBy('revenue', 'DESC')
      .limit(limit)
      .offset(skip);

    const rawData = await qb.getRawMany();

    return {
      items: rawData.map((row) => ({
        courseName: row.name || 'Unknown Course',
        category: 'COURSE', // Fallback for UI
        nextSession: 'TBA', // Fallback for UI
        instructorDetails: {
          id: null,
          name: 'TBA', // Fallback
          image: null,
        },
        enrolled: Number(row.enrolled || 0),
        completion: '85%', // Mocked for UI
        revenue: Number(row.revenue || 0),
        status: 'Active',
      })),
      meta: { page, limit },
    };
  }

  // // ────────────────── TRAFFIC SOURCES (Mocked for API completion) ──────────────────
  // async getTrafficSources(
  //   query: AnalyticsQueryDto,
  // ): Promise<Record<string, unknown>> {
  //   return {
  //     note: 'Backend does not track browser sessions. Implement Google Analytics or a PageView table for real data.',
  //     items: [
  //       { source: 'Direct', visitors: 15400, percentage: 45 },
  //       { source: 'Organic Search', visitors: 10200, percentage: 30 },
  //       { source: 'Social Media', visitors: 5100, percentage: 15 },
  //       { source: 'Referral', visitors: 3400, percentage: 10 },
  //     ],
  //   };
  // }

  // ────────────────── REVENUE OVERVIEW CHART ──────────────────
  async getRevenueChart(
    query: RevenueChartQueryDto,
  ): Promise<Record<string, unknown>> {
    const { start, end, isAllTime } = this.getDateRanges(query);

    let dateGroup = "DATE_TRUNC('day', ord.createdAt)";
    let wosDateGroup = "DATE_TRUNC('day', wos.createdAt)";
    if (query.groupBy === 'week') {
      dateGroup = "DATE_TRUNC('week', ord.createdAt)";
      wosDateGroup = "DATE_TRUNC('week', wos.createdAt)";
    }
    if (query.groupBy === 'month') {
      dateGroup = "DATE_TRUNC('month', ord.createdAt)";
      wosDateGroup = "DATE_TRUNC('month', wos.createdAt)";
    }

    const qbProd = this.orderRepo
      .createQueryBuilder('ord')
      .select(`${dateGroup}`, 'date')
      .addSelect(`SUM(ord.grandTotal)`, 'productRevenue')
      .where('ord.paymentStatus = :status', { status: PaymentStatus.PAID })
      .andWhere('ord.type = :type', { type: OrderType.PRODUCT });

    const qbCourse = this.workshopOrderSummaryRepo
      .createQueryBuilder('wos')
      .select(`${wosDateGroup}`, 'date')
      .addSelect(`SUM(wos.totalPrice)`, 'courseRevenue')
      .where('wos.status = :status', { status: OrderSummaryStatus.COMPLETED });

    if (!isAllTime) {
      qbProd.andWhere('ord.createdAt BETWEEN :s AND :e', { s: start, e: end });
      qbCourse.andWhere('wos.createdAt BETWEEN :s AND :e', {
        s: start,
        e: end,
      });
    }

    const productData = await qbProd.groupBy('date').getRawMany();
    const courseData = await qbCourse.groupBy('date').getRawMany();

    const chartMap = new Map<string, any>();

    productData.forEach((row) => {
      const dStr = new Date(row.date).toISOString();
      chartMap.set(dStr, {
        date: dStr,
        courseRevenue: 0,
        productRevenue: Number(row.productRevenue || 0),
      });
    });

    courseData.forEach((row) => {
      const dStr = new Date(row.date).toISOString();
      if (chartMap.has(dStr)) {
        chartMap.get(dStr).courseRevenue = Number(row.courseRevenue || 0);
      } else {
        chartMap.set(dStr, {
          date: dStr,
          courseRevenue: Number(row.courseRevenue || 0),
          productRevenue: 0,
        });
      }
    });

    const series = Array.from(chartMap.values()).sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    return { series };
  }
}
