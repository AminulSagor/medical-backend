import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { Order } from 'src/orders/entities/order.entity';
import { WorkshopEnrollment } from 'src/workshops/entities/workshop-enrollment.entity';
import { Product } from 'src/products/entities/product.entity';
import {
  OrderSummaryStatus,
  WorkshopOrderSummary,
} from 'src/workshops/entities/workshop-order-summary.entity';
import { OrderType, PaymentStatus } from 'src/common/enums/order.enums';
import { PublicNavbarSearchQueryDto } from './dto/public-navbar-search-query.dto';
import {
  Workshop,
  WorkshopStatus,
} from 'src/workshops/entities/workshop.entity';
import { BlogPost, PublishingStatus } from 'src/blog/entities/blog-post.entity';
import {
  ReservationStatus,
  WorkshopReservation,
} from 'src/workshops/entities/workshop-reservation.entity';
import { CourseProgressStatus } from 'src/workshops/entities/course-progress-status.enum';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Order) private orderRepo: Repository<Order>,
    @InjectRepository(WorkshopEnrollment)
    private enrollmentRepo: Repository<WorkshopEnrollment>,
    @InjectRepository(Product) private productRepo: Repository<Product>,
    @InjectRepository(WorkshopOrderSummary)
    private workshopOrderSummaryRepo: Repository<WorkshopOrderSummary>,
    @InjectRepository(Workshop)
    private readonly workshopsRepo: Repository<Workshop>,
    @InjectRepository(BlogPost)
    private readonly blogPostsRepo: Repository<BlogPost>,
    @InjectRepository(WorkshopReservation)
    private readonly reservationsRepo: Repository<WorkshopReservation>,
  ) {}

  async getOverviewAnalytics() {
    const now = new Date();

    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const last30DaysStart = new Date(now);
    last30DaysStart.setDate(last30DaysStart.getDate() - 30);
    last30DaysStart.setHours(0, 0, 0, 0);

    const prev30DaysStart = new Date(last30DaysStart);
    prev30DaysStart.setDate(prev30DaysStart.getDate() - 30);

    const quarterStart = new Date(
      now.getFullYear(),
      Math.floor(now.getMonth() / 3) * 3,
      1,
    );
    quarterStart.setHours(0, 0, 0, 0);

    const formatChange = (current: number, previous: number) => {
      if (previous === 0 && current === 0) {
        return { percent: '0%', direction: 'neutral' as const };
      }

      if (previous === 0 && current > 0) {
        return { percent: '+100%', direction: 'up' as const };
      }

      const raw = ((current - previous) / previous) * 100;
      const rounded = Number(raw.toFixed(1));

      return {
        percent: `${rounded > 0 ? '+' : ''}${rounded}%`,
        direction:
          rounded > 0
            ? ('up' as const)
            : rounded < 0
              ? ('down' as const)
              : ('neutral' as const),
      };
    };

    const formatLabel = (value?: string | null) => {
      if (!value) return null;
      return value
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
    };

    const getProductRevenue = async (start?: Date, end?: Date) => {
      const qb = this.orderRepo
        .createQueryBuilder('o')
        .select('COALESCE(SUM(o.grandTotal), 0)', 'total')
        .where('o.paymentStatus = :status', { status: PaymentStatus.PAID })
        .andWhere('o.type = :type', { type: OrderType.PRODUCT });

      if (start && end) {
        qb.andWhere('o.createdAt BETWEEN :start AND :end', { start, end });
      }

      const res = await qb.getRawOne<{ total: string }>();
      return Number(res?.total ?? 0);
    };

    const getWorkshopRevenue = async (start?: Date, end?: Date) => {
      const qb = this.workshopOrderSummaryRepo
        .createQueryBuilder('wos')
        .select('COALESCE(SUM(wos.totalPrice), 0)', 'total')
        .where('wos.status = :status', {
          status: OrderSummaryStatus.COMPLETED,
        });

      if (start && end) {
        qb.andWhere('wos.createdAt BETWEEN :start AND :end', { start, end });
      }

      const res = await qb.getRawOne<{ total: string }>();
      return Number(res?.total ?? 0);
    };

    const getProductUnitsSold = async (start?: Date, end?: Date) => {
      const qb = this.orderRepo
        .createQueryBuilder('o')
        .innerJoin('o.items', 'item')
        .select('COALESCE(SUM(item.quantity), 0)', 'total')
        .where('o.paymentStatus = :status', { status: PaymentStatus.PAID })
        .andWhere('o.type = :type', { type: OrderType.PRODUCT });

      if (start && end) {
        qb.andWhere('o.createdAt BETWEEN :start AND :end', { start, end });
      }

      const res = await qb.getRawOne<{ total: string }>();
      return Number(res?.total ?? 0);
    };

    const getNewActiveStudents = async (start?: Date, end?: Date) => {
      const qb = this.reservationsRepo
        .createQueryBuilder('r')
        .innerJoin('workshops', 'w', 'w.id = r."workshopId"')
        .select('COUNT(DISTINCT r."userId")', 'total')
        .where('r.status = :reservationStatus', {
          reservationStatus: ReservationStatus.CONFIRMED,
        })
        .andWhere('w.status != :draftStatus', {
          draftStatus: WorkshopStatus.DRAFT,
        });

      if (start && end) {
        qb.andWhere('r.createdAt BETWEEN :start AND :end', { start, end });
      }

      const res = await qb.getRawOne<{ total: string }>();
      return Number(res?.total ?? 0);
    };

    const currentProductRevenuePromise = getProductRevenue(
      last30DaysStart,
      now,
    );
    const previousProductRevenuePromise = getProductRevenue(
      prev30DaysStart,
      last30DaysStart,
    );
    const currentWorkshopRevenuePromise = getWorkshopRevenue(
      last30DaysStart,
      now,
    );
    const previousWorkshopRevenuePromise = getWorkshopRevenue(
      prev30DaysStart,
      last30DaysStart,
    );
    const currentStudentsWindowPromise = getNewActiveStudents(
      last30DaysStart,
      now,
    );
    const previousStudentsWindowPromise = getNewActiveStudents(
      prev30DaysStart,
      last30DaysStart,
    );
    const currentProductSalesPromise = getProductUnitsSold(
      last30DaysStart,
      now,
    );
    const previousProductSalesPromise = getProductUnitsSold(
      prev30DaysStart,
      last30DaysStart,
    );

    const activeStudentsPromise = this.reservationsRepo
      .createQueryBuilder('r')
      .innerJoin('workshops', 'w', 'w.id = r."workshopId"')
      .select('COUNT(DISTINCT r."userId")', 'total')
      .where('r.status = :reservationStatus', {
        reservationStatus: ReservationStatus.CONFIRMED,
      })
      .andWhere('w.status != :draftStatus', {
        draftStatus: WorkshopStatus.DRAFT,
      })
      .andWhere(
        `EXISTS (
        SELECT 1
        FROM workshop_days wd
        WHERE wd."workshopId" = w.id
          AND wd.date >= CURRENT_DATE
      )`,
      )
      .getRawOne<{ total: string }>();

    const courseCompletionsPromise = this.reservationsRepo
      .createQueryBuilder('r')
      .select('COALESCE(SUM(r.numberOfSeats), 0)', 'total')
      .where('r.status = :reservationStatus', {
        reservationStatus: ReservationStatus.CONFIRMED,
      })
      .andWhere('r.courseProgressStatus = :progressStatus', {
        progressStatus: CourseProgressStatus.COMPLETED,
      })
      .andWhere('r.createdAt >= :quarterStart', { quarterStart })
      .getRawOne<{ total: string }>();

    const lowStockProductsPromise = this.productRepo
      .createQueryBuilder('p')
      .select([
        'p.id AS id',
        'p.name AS name',
        'p.stockQuantity AS "stockQuantity"',
        'p.lowStockAlert AS "lowStockAlert"',
        'p.updatedAt AS "updatedAt"',
      ])
      .where('p.isActive = :isActive', { isActive: true })
      .andWhere('p.stockQuantity <= p.lowStockAlert')
      .orderBy('p.updatedAt', 'DESC')
      .addOrderBy('p.stockQuantity', 'ASC')
      .limit(5)
      .getRawMany<{
        id: string;
        name: string;
        stockQuantity: string;
        lowStockAlert: string;
        updatedAt: Date;
      }>();

    const recentEnrollmentsPromise = this.reservationsRepo
      .createQueryBuilder('r')
      .innerJoin('workshops', 'w', 'w.id = r."workshopId"')
      .innerJoin('users', 'u', 'u.id = r."userId"')
      .select([
        'r.id AS id',
        'r.createdAt AS date',
        'r.status AS status',
        'u.id AS "studentId"',
        'u.fullLegalName AS "studentName"',
        'u.profilePhotoUrl AS "studentAvatarUrl"',
        'w.id AS "courseId"',
        'w.title AS "courseTitle"',
      ])
      .where('r.status != :cancelledStatus', {
        cancelledStatus: ReservationStatus.CANCELLED,
      })
      .andWhere('w.status != :draftStatus', {
        draftStatus: WorkshopStatus.DRAFT,
      })
      .orderBy('r.createdAt', 'DESC')
      .limit(10)
      .getRawMany<{
        id: string;
        date: Date;
        status: string;
        studentId: string;
        studentName: string;
        studentAvatarUrl: string | null;
        courseId: string;
        courseTitle: string;
      }>();

    const topCoursesPromise = this.workshopOrderSummaryRepo
      .createQueryBuilder('wos')
      .leftJoin('wos.workshop', 'w')
      .select('wos.workshopId', 'id')
      .addSelect('MAX(w.title)', 'name')
      .addSelect('SUM(wos.numberOfSeats)', 'enrolled')
      .addSelect('SUM(wos.totalPrice)', 'revenue')
      .where('wos.workshopId IS NOT NULL')
      .andWhere('w.status != :draftStatus', {
        draftStatus: WorkshopStatus.DRAFT,
      })
      .groupBy('wos.workshopId')
      .orderBy('SUM(wos.numberOfSeats)', 'DESC')
      .addOrderBy('SUM(wos.totalPrice)', 'DESC')
      .limit(3)
      .getRawMany<{
        id: string;
        name: string;
        enrolled: string;
        revenue: string;
      }>();

    const recentOrdersPromise = this.orderRepo
      .createQueryBuilder('o')
      .select([
        'o.id AS id',
        'o.orderNumber AS "orderNumber"',
        'o.grandTotal AS "grandTotal"',
        'o.createdAt AS "createdAt"',
      ])
      .where('o.paymentStatus = :status', { status: PaymentStatus.PAID })
      .orderBy('o.createdAt', 'DESC')
      .limit(5)
      .getRawMany<{
        id: string;
        orderNumber: string;
        grandTotal: string;
        createdAt: Date;
      }>();

    const recentBlogsPromise = this.blogPostsRepo
      .createQueryBuilder('b')
      .select([
        'b.id AS id',
        'b.title AS title',
        'COALESCE(b.publishedAt, b.createdAt) AS "createdAt"',
      ])
      .where('b.publishingStatus = :status', { status: 'published' })
      .orderBy('COALESCE(b.publishedAt, b.createdAt)', 'DESC')
      .limit(5)
      .getRawMany<{
        id: string;
        title: string;
        createdAt: Date;
      }>();

    const recentWorkshopsPromise = this.workshopsRepo
      .createQueryBuilder('w')
      .select(['w.id AS id', 'w.title AS title', 'w.createdAt AS "createdAt"'])
      .where('w.status != :draftStatus', {
        draftStatus: WorkshopStatus.DRAFT,
      })
      .orderBy('w.createdAt', 'DESC')
      .limit(5)
      .getRawMany<{
        id: string;
        title: string;
        createdAt: Date;
      }>();

    const productRevenueByDayPromise = this.orderRepo
      .createQueryBuilder('o')
      .select(`TO_CHAR(DATE("o"."createdAt"), 'YYYY-MM-DD')`, 'date')
      .addSelect('COALESCE(SUM("o"."grandTotal"), 0)', 'total')
      .where('"o"."paymentStatus" = :status', { status: PaymentStatus.PAID })
      .andWhere('"o"."type" = :type', { type: OrderType.PRODUCT })
      .andWhere('"o"."createdAt" >= :start', {
        start: new Date(startOfToday.getTime() - 6 * 24 * 60 * 60 * 1000),
      })
      .groupBy(`DATE("o"."createdAt")`)
      .orderBy(`DATE("o"."createdAt")`, 'ASC')
      .getRawMany<{ date: string; total: string }>();

    const workshopRevenueByDayPromise = this.workshopOrderSummaryRepo
      .createQueryBuilder('wos')
      .select(`TO_CHAR(DATE("wos"."createdAt"), 'YYYY-MM-DD')`, 'date')
      .addSelect('COALESCE(SUM("wos"."totalPrice"), 0)', 'total')
      .where('"wos"."status" = :status', {
        status: OrderSummaryStatus.COMPLETED,
      })
      .andWhere('"wos"."createdAt" >= :start', {
        start: new Date(startOfToday.getTime() - 6 * 24 * 60 * 60 * 1000),
      })
      .groupBy(`DATE("wos"."createdAt")`)
      .orderBy(`DATE("wos"."createdAt")`, 'ASC')
      .getRawMany<{ date: string; total: string }>();

    const [
      currentProductRevenue,
      previousProductRevenue,
      currentWorkshopRevenue,
      previousWorkshopRevenue,
      currentStudentsWindow,
      previousStudentsWindow,
      currentProductSales,
      previousProductSales,
      activeStudentsRaw,
      courseCompletionsRaw,
      lowStockProductsRaw,
      recentEnrollmentsRaw,
      topCoursesRaw,
      recentOrdersRaw,
      recentBlogsRaw,
      recentWorkshopsRaw,
      productRevenueByDayRaw,
      workshopRevenueByDayRaw,
    ] = await Promise.all([
      currentProductRevenuePromise,
      previousProductRevenuePromise,
      currentWorkshopRevenuePromise,
      previousWorkshopRevenuePromise,
      currentStudentsWindowPromise,
      previousStudentsWindowPromise,
      currentProductSalesPromise,
      previousProductSalesPromise,
      activeStudentsPromise,
      courseCompletionsPromise,
      lowStockProductsPromise,
      recentEnrollmentsPromise,
      topCoursesPromise,
      recentOrdersPromise,
      recentBlogsPromise,
      recentWorkshopsPromise,
      productRevenueByDayPromise,
      workshopRevenueByDayPromise,
    ]);

    const totalRevenueValue = currentProductRevenue + currentWorkshopRevenue;
    const previousRevenueValue =
      previousProductRevenue + previousWorkshopRevenue;

    const totalRevenueChange = formatChange(
      totalRevenueValue,
      previousRevenueValue,
    );
    const activeStudentsChange = formatChange(
      currentStudentsWindow,
      previousStudentsWindow,
    );
    const productSalesChange = formatChange(
      currentProductSales,
      previousProductSales,
    );

    const activeStudents = Number(activeStudentsRaw?.total ?? 0);
    const courseCompletions = Number(courseCompletionsRaw?.total ?? 0);

    const trendMap = new Map<string, number>();

    for (let i = 6; i >= 0; i--) {
      const d = new Date(startOfToday.getTime() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      trendMap.set(key, 0);
    }

    for (const row of productRevenueByDayRaw) {
      trendMap.set(
        row.date,
        (trendMap.get(row.date) ?? 0) + Number(row.total ?? 0),
      );
    }

    for (const row of workshopRevenueByDayRaw) {
      trendMap.set(
        row.date,
        (trendMap.get(row.date) ?? 0) + Number(row.total ?? 0),
      );
    }

    const revenueTrendPoints = Array.from(trendMap.entries()).map(
      ([date, value]) => {
        const d = new Date(date);
        return {
          label: d.toLocaleDateString('en-US', { weekday: 'short' }),
          date,
          value: Number(value.toFixed(2)),
        };
      },
    );

    const recentActivities = [
      ...recentOrdersRaw.map((o) => ({
        id: `order-${o.id}`,
        type: 'ORDER',
        title: 'New order received',
        description: `Order #${o.orderNumber} • $${Number(o.grandTotal ?? 0).toFixed(2)}`,
        timeLabel: new Date(o.createdAt).toLocaleString(),
        createdAt: new Date(o.createdAt),
        icon: 'shopping-cart',
        actionRoute: `/admin/orders/${o.id}`,
      })),
      ...recentBlogsRaw.map((b) => ({
        id: `blog-${b.id}`,
        type: 'BLOG',
        title: 'Blog published',
        description: b.title,
        timeLabel: new Date(b.createdAt).toLocaleString(),
        createdAt: new Date(b.createdAt),
        icon: 'file-text',
        actionRoute: `/admin/blogs/${b.id}`,
      })),
      ...recentWorkshopsRaw.map((w) => ({
        id: `workshop-${w.id}`,
        type: 'WORKSHOP',
        title: 'Workshop created',
        description: w.title,
        timeLabel: new Date(w.createdAt).toLocaleString(),
        createdAt: new Date(w.createdAt),
        icon: 'book',
        actionRoute: `/admin/workshops/${w.id}`,
      })),
    ]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 5);

    const topCourseIds = topCoursesRaw.map((row) => row.id).filter(Boolean);

    const topCourseWorkshops = topCourseIds.length
      ? await this.workshopsRepo.find({
          where: { id: In(topCourseIds) } as any,
          relations: ['days', 'faculty'],
        })
      : [];

    const topCourseWorkshopMap = new Map(
      topCourseWorkshops.map((workshop) => [workshop.id, workshop]),
    );

    const reservationRows = topCourseIds.length
      ? await this.reservationsRepo
          .createQueryBuilder('reservation')
          .select('reservation.workshopId', 'workshopId')
          .addSelect(
            'COALESCE(SUM(reservation.numberOfSeats), 0)',
            'totalSeats',
          )
          .addSelect(
            `COALESCE(SUM(CASE WHEN reservation.courseProgressStatus = :completedStatus THEN reservation.numberOfSeats ELSE 0 END), 0)`,
            'completedSeats',
          )
          .where('reservation.workshopId IN (:...workshopIds)', {
            workshopIds: topCourseIds,
          })
          .andWhere('reservation.status = :confirmedStatus', {
            confirmedStatus: ReservationStatus.CONFIRMED,
          })
          .setParameter('completedStatus', CourseProgressStatus.COMPLETED)
          .groupBy('reservation.workshopId')
          .getRawMany<{
            workshopId: string;
            totalSeats: string;
            completedSeats: string;
          }>()
      : [];

    const topCourseReservationMap = new Map(
      reservationRows.map((row) => [
        row.workshopId,
        {
          totalSeats: Number(row.totalSeats || 0),
          completedSeats: Number(row.completedSeats || 0),
        },
      ]),
    );

    const maxTopCourseEnrolled = Math.max(
      ...topCoursesRaw.map((c) => Number(c.enrolled ?? 0)),
      0,
    );

    const topPerformingCourses = topCoursesRaw.map((row, idx) => {
      const workshop: any = topCourseWorkshopMap.get(row.id);
      const reservationStats = topCourseReservationMap.get(row.id) ?? {
        totalSeats: 0,
        completedSeats: 0,
      };

      const completion =
        reservationStats.totalSeats > 0
          ? `${(
              (reservationStats.completedSeats / reservationStats.totalSeats) *
              100
            ).toFixed(1)}%`
          : '0.0%';

      const sortedDays = [...(workshop?.days ?? [])]
        .map((day: any) => day?.date)
        .filter(Boolean)
        .sort((a: string, b: string) => a.localeCompare(b));

      const today = new Date().toISOString().slice(0, 10);
      const nextSession =
        sortedDays.find((date: string) => date >= today) ??
        sortedDays[0] ??
        workshop?.registrationDeadline ??
        null;

      const instructor = workshop?.faculty?.[0];
      const enrolled = Number(row.enrolled || 0);
      const revenue = Number(row.revenue || 0);

      return {
        courseId: row.id,
        courseTitle: row.name || workshop?.title || 'Unknown Course',
        scorePercent:
          maxTopCourseEnrolled > 0
            ? Number(((enrolled / maxTopCourseEnrolled) * 100).toFixed(1))
            : 0,
        rank: idx + 1,
        enrolled,
        completion,
        revenue,
        category: workshop?.deliveryMode
          ? formatLabel(workshop.deliveryMode)
          : null,
        nextSession,
        instructorDetails: instructor
          ? {
              id: instructor.id,
              name:
                [instructor.firstName, instructor.lastName]
                  .filter(Boolean)
                  .join(' ') || 'Unknown Instructor',
              image: instructor.imageUrl || null,
            }
          : null,
        status: workshop?.status ? formatLabel(workshop.status) : null,
        barColorKey: idx === 0 ? 'blue' : idx === 1 ? 'indigo' : 'purple',
      };
    });

    return {
      title: 'Overview Analytics',
      subtitle: "Track your institute's performance at a glance.",
      kpis: {
        totalRevenue: {
          value: Number(totalRevenueValue.toFixed(2)),
          currency: '$',
          changePercent: totalRevenueChange.percent,
          changeDirection: totalRevenueChange.direction,
          subtext: 'vs. previous 30 days',
        },
        activeStudents: {
          value: activeStudents,
          changePercent: activeStudentsChange.percent,
          changeDirection: activeStudentsChange.direction,
          subtext: 'Currently enrolled in active workshops',
        },
        courseCompletions: {
          value: courseCompletions,
          subtext: 'This quarter',
        },
        productSales: {
          value: currentProductSales,
          changePercent: productSalesChange.percent,
          changeDirection: productSalesChange.direction,
          subtext: 'Units sold in last 30 days',
        },
      },
      revenueTrend: {
        range: 'Last 7 Days',
        rangeOptions: ['Last 7 Days', 'Last 30 Days', 'This Year'],
        points: revenueTrendPoints,
      },
      quickActions: [
        {
          key: 'add_product',
          label: 'Add New Product',
          icon: 'plus-square',
          route: '/admin/products/new',
          enabled: true,
        },
        {
          key: 'create_newsletter',
          label: 'Create Newsletter',
          icon: 'mail',
          route: '/admin/newsletters/new',
          enabled: true,
        },
        {
          key: 'manage_courses',
          label: 'Manage Courses',
          icon: 'book',
          route: '/admin/courses',
          enabled: true,
        },
      ],
      recentEnrollments: recentEnrollmentsRaw.map((e) => ({
        id: e.id,
        studentId: e.studentId,
        studentName: e.studentName || 'Unknown Student',
        studentAvatarUrl: e.studentAvatarUrl || null,
        courseId: e.courseId,
        courseTitle: e.courseTitle || 'Unknown Course',
        date: e.date,
        status: e.status,
        viewAllEnrollmentsRoute: '/admin/courses/enrollments',
      })),
      lowStockAlerts: lowStockProductsRaw.map((p) => {
        const unitsLeft = Number(p.stockQuantity ?? 0);
        const threshold = Number(p.lowStockAlert ?? 0);

        return {
          productId: p.id,
          productName: p.name,
          unitsLeft,
          threshold,
          severity:
            unitsLeft === 0
              ? 'CRITICAL'
              : unitsLeft <= Math.max(1, Math.floor(threshold / 2))
                ? 'HIGH'
                : 'WARNING',
          manageInventoryRoute: '/admin/products/inventory',
        };
      }),
      recentActivities,
      topPerformingCourses,
    };
  }

  async searchNavbar(
    query: PublicNavbarSearchQueryDto,
  ): Promise<Record<string, unknown>> {
    const q = query.q?.trim();
    if (!q) {
      throw new BadRequestException('q is required');
    }

    const limitPerType = query.limitPerType ?? 4;
    const searchTerm = `%${q.toLowerCase()}%`;

    const [workshops, products, blogs] = await Promise.all([
      this.workshopsRepo
        .createQueryBuilder('w')
        .leftJoinAndSelect('w.days', 'days')
        .where('w.status = :status', { status: WorkshopStatus.PUBLISHED })
        .andWhere(
          `(
          LOWER(w.title) LIKE :searchTerm
          OR LOWER(COALESCE(w.shortBlurb, '')) LIKE :searchTerm
          OR LOWER(COALESCE(w.learningObjectives, '')) LIKE :searchTerm
        )`,
          { searchTerm },
        )
        .orderBy('w.createdAt', 'DESC')
        .take(limitPerType)
        .getMany(),

      this.productRepo
        .createQueryBuilder('p')
        .leftJoinAndSelect('p.details', 'details')
        .where('p.isActive = :isActive', { isActive: true })
        .andWhere(
          `(
          LOWER(p.name) LIKE :searchTerm
          OR LOWER(COALESCE(p.sku, '')) LIKE :searchTerm
          OR LOWER(COALESCE(p.clinicalDescription, '')) LIKE :searchTerm
        )`,
          { searchTerm },
        )
        .orderBy('p.createdAt', 'DESC')
        .take(limitPerType)
        .getMany(),

      this.blogPostsRepo
        .createQueryBuilder('b')
        .where('b.publishingStatus = :status', {
          status: PublishingStatus.PUBLISHED,
        })
        .andWhere(
          `(
          LOWER(b.title) LIKE :searchTerm
          OR LOWER(COALESCE(b.excerpt, '')) LIKE :searchTerm
          OR LOWER(COALESCE(b.authorName, '')) LIKE :searchTerm
          OR LOWER(COALESCE(b.content, '')) LIKE :searchTerm
        )`,
          { searchTerm },
        )
        .orderBy('b.publishedAt', 'DESC')
        .take(limitPerType)
        .getMany(),
    ]);

    const todayStr = new Date().toISOString().slice(0, 10);

    const workshopItems = workshops.map((workshop) => {
      const sortedDays = [...(workshop.days ?? [])].sort((a, b) =>
        a.date.localeCompare(b.date),
      );
      const workshopDate = sortedDays[0]?.date || null;

      return {
        id: workshop.id,
        identityType: 'WORKSHOP',
        title: workshop.title,
        subtitle: workshop.shortBlurb ?? null,
        imageUrl: workshop.coverImageUrl ?? null,
        description: workshop.learningObjectives ?? null,
        date: workshopDate,
        isUpcoming: workshopDate ? workshopDate >= todayStr : false,
      };
    });

    const productItems = products.map((product) => ({
      id: product.id,
      identityType: 'PRODUCT',
      title: product.name,
      subtitle: product.clinicalDescription ?? null,
      imageUrl: product.details?.images?.[0] ?? null,
      sku: product.sku ?? null,
      price: product.actualPrice ?? null,
      offerPrice: product.offerPrice ?? null,
      inStock: Number(product.stockQuantity ?? 0) > 0,
    }));

    const blogItems = blogs.map((blog) => ({
      id: blog.id,
      identityType: 'BLOG',
      title: blog.title,
      subtitle: blog.excerpt ?? null,
      imageUrl:
        blog.coverImages?.find((img) => img.imageType === 'thumbnail')
          ?.imageUrl ??
        blog.coverImages?.[0]?.imageUrl ??
        null,
      authorName: blog.authorName ?? null,
      publishedAt: blog.publishedAt ?? null,
      readTimeMinutes: blog.readTimeMinutes ?? 0,
      readCount: blog.readCount ?? 0,
    }));

    const items = [...workshopItems, ...productItems, ...blogItems];

    return {
      message: 'Navbar search results fetched successfully',
      data: {
        query: q,
        items,
        counts: {
          workshops: workshopItems.length,
          products: productItems.length,
          blogs: blogItems.length,
          total: items.length,
        },
      },
    };
  }

  async getHomepageOverviewStats(): Promise<Record<string, unknown>> {
    const [totalWorkshops, totalProducts, totalBlogs, totalEnrolleeRaw] =
      await Promise.all([
        this.workshopsRepo.count({
          where: { status: WorkshopStatus.PUBLISHED } as any,
        }),

        this.productRepo.count({
          where: { isActive: true } as any,
        }),

        this.blogPostsRepo.count({
          where: { publishingStatus: PublishingStatus.PUBLISHED } as any,
        }),

        this.reservationsRepo
          .createQueryBuilder('r')
          .innerJoin(Workshop, 'w', 'w.id = r.workshopId')
          .select('COALESCE(SUM(r.numberOfSeats), 0)', 'total')
          .where('r.status != :cancelledStatus', {
            cancelledStatus: ReservationStatus.CANCELLED,
          })
          .andWhere('w.status = :publishedStatus', {
            publishedStatus: WorkshopStatus.PUBLISHED,
          })
          .getRawOne<{ total: string }>(),
      ]);

    const totalEnrollee = Number(totalEnrolleeRaw?.total ?? 0);

    return {
      message: 'Homepage overview stats fetched successfully',
      data: {
        totalWorkshops,
        totalEnrollee,
        totalBlogs,
        totalProducts,
      },
    };
  }
}
