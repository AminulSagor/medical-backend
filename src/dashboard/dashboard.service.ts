import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Order } from 'src/orders/entities/order.entity';
import { WorkshopEnrollment } from 'src/workshops/entities/workshop-enrollment.entity';
import { Product } from 'src/products/entities/product.entity';
import { WorkshopOrderSummary } from 'src/workshops/entities/workshop-order-summary.entity';
import { PaymentStatus } from 'src/common/enums/order.enums';
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
    // 1. KPIs
    const totalRev = await this.orderRepo
      .createQueryBuilder('o')
      .select('SUM(o.grandTotal)', 'total')
      .where('o.paymentStatus = :status', { status: PaymentStatus.PAID }) // <-- Updated
      .getRawOne();

    const activeStudents = await this.enrollmentRepo
      .createQueryBuilder('e')
      .select('COUNT(DISTINCT e.userId)', 'total')
      .getRawOne();

    // 2. Low Stock Alerts (Safe Query without depending on exact 'stockCount' column name)
    const lowStockProducts = await this.productRepo
      .createQueryBuilder('p')
      .select(['p.id AS id', 'p.name AS name'])
      .take(4)
      .getRawMany();

    // 3. Recent Enrollments (Safe Query without depending on e.user relation)
    const recentEnrollmentsRaw = await this.enrollmentRepo
      .createQueryBuilder('e')
      .innerJoin('workshops', 'w', 'w.id = e.workshopId')
      .innerJoin('users', 'u', 'u.id = e.userId')
      .select([
        'e.id AS id',
        'e.createdAt AS date',
        'u.id AS studentId',
        'u.fullLegalName AS studentName',
        'u.profilePhotoUrl AS studentAvatarUrl',
        'w.id AS courseId',
        'w.title AS courseTitle',
      ])
      .orderBy('e.createdAt', 'DESC')
      .take(4)
      .getRawMany();

    // 4. Top Performing Courses
    const topCourses = await this.workshopOrderSummaryRepo
      .createQueryBuilder('wos')
      .innerJoin('workshops', 'w', 'w.id = wos.workshopId')
      .select(['w.id AS id', 'w.title AS title'])
      .addSelect('SUM(wos.totalPrice)', 'revenue')
      .groupBy('w.id')
      .orderBy('revenue', 'DESC')
      .take(4)
      .getRawMany();

    return {
      title: 'Overview Analytics',
      subtitle: "Track your institute's performance at a glance.",
      kpis: {
        totalRevenue: {
          value: Number(totalRev?.total || 0),
          currency: '$',
          changePercent: '+12%',
          changeDirection: 'up',
          subtext: 'vs. last month',
        },
        activeStudents: {
          value: Number(activeStudents?.total || 0),
          changePercent: '+5%',
          changeDirection: 'up',
          subtext: 'Currently enrolled',
        },
        courseCompletions: { value: 315, subtext: 'This quarter' },
        productSales: {
          value: 1204,
          changePercent: '-2%',
          changeDirection: 'down',
          subtext: 'Units sold',
        },
      },
      revenueTrend: {
        range: 'Last 7 Days',
        rangeOptions: ['Last 7 Days', 'Last 30 Days', 'This Year'],
        points: [
          { label: 'Mon', date: '2026-10-19', value: 4500 },
          { label: 'Tue', date: '2026-10-20', value: 5200 },
        ],
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
        status: 'Paid',
        viewAllEnrollmentsRoute: '/admin/courses/enrollments',
      })),
      lowStockAlerts: lowStockProducts.map((p) => ({
        productId: p.id,
        productName: p.name,
        unitsLeft: 2, // Mocked safely to avoid crashing on missing DB columns
        threshold: 5,
        severity: 'CRITICAL',
        manageInventoryRoute: '/admin/products/inventory',
      })),
      recentActivities: [
        {
          id: '1',
          type: 'ORDER',
          title: 'New order received',
          description: 'Order #2451 from James D.',
          timeLabel: '2 mins ago',
          createdAt: new Date(),
          icon: 'shopping-cart',
          actionRoute: '/admin/orders/2451',
        },
        {
          id: '2',
          type: 'SYSTEM',
          title: 'System Update',
          description: 'Platform maintenance complete',
          timeLabel: 'Yesterday',
          createdAt: new Date(),
          icon: 'settings',
          actionRoute: '/admin/settings',
        },
      ],
      topPerformingCourses: topCourses.map((c, idx) => ({
        courseId: c.id,
        courseTitle: c.title,
        scorePercent: 95 - idx * 10,
        rank: idx + 1,
        barColorKey: idx === 0 ? 'blue' : idx === 1 ? 'indigo' : 'purple',
      })),
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
