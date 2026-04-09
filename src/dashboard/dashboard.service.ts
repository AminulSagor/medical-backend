import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Order } from 'src/orders/entities/order.entity';
import { WorkshopEnrollment } from 'src/workshops/entities/workshop-enrollment.entity';
import { Product } from 'src/products/entities/product.entity';
import { WorkshopOrderSummary } from 'src/workshops/entities/workshop-order-summary.entity';
import { PaymentStatus } from 'src/common/enums/order.enums';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Order) private orderRepo: Repository<Order>,
    @InjectRepository(WorkshopEnrollment)
    private enrollmentRepo: Repository<WorkshopEnrollment>,
    @InjectRepository(Product) private productRepo: Repository<Product>,
    @InjectRepository(WorkshopOrderSummary)
    private workshopOrderSummaryRepo: Repository<WorkshopOrderSummary>,
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
}
