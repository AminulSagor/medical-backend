import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import {
  Notification,
  NotificationPriority,
} from './entities/notification.entity';
import { NotificationPreference } from './entities/notification-preference.entity';
import {
  NotificationFilterDto,
  UpdatePreferencesDto,
} from './dto/notifications.dto';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification) private notifRepo: Repository<Notification>,
    @InjectRepository(NotificationPreference)
    private prefRepo: Repository<NotificationPreference>,
  ) {}

  // ── 1. BELL DROPDOWN ──
  async getDropdownNotifications(userId: string) {
    const unreadCount = await this.notifRepo.count({
      where: { userId, isRead: false },
    });
    const recent = await this.notifRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 5,
    });

    return {
      title: 'Notifications',
      unreadCount,
      viewAllRoute: '/admin/notifications',
      recentNotifications: recent.map((n) => ({
        id: n.id,
        title: n.title,
        message: n.message,
        category: n.category,
        priority: n.priority,
        createdAt: n.createdAt,
        timeLabel: this.getTimeLabel(n.createdAt), // e.g., '12 mins ago'
        icon: n.icon || 'default-icon',
        isRead: n.isRead,
        actionRoute: n.actionRoute,
      })),
    };
  }

  // ── 2. ALL NOTIFICATIONS PAGE (WITH FILTERS) ──
  async getAllNotifications(userId: string, query: NotificationFilterDto) {
    const page = query.page || 1;
    const limit = query.limit || 10;

    const qb = this.notifRepo
      .createQueryBuilder('n')
      .where('n.userId = :userId', { userId });

    // Apply Filters
    if (query.dateFrom)
      qb.andWhere('n.createdAt >= :from', { from: new Date(query.dateFrom) });
    if (query.dateTo)
      qb.andWhere('n.createdAt <= :to', { to: new Date(query.dateTo) });
    if (query.category?.length)
      qb.andWhere('n.category IN (:...cats)', { cats: query.category });
    if (query.priority?.length)
      qb.andWhere('n.priority IN (:...prios)', { prios: query.priority });

    if (query.status === 'Unread Only') qb.andWhere('n.isRead = false');
    if (query.status === 'Read Only') qb.andWhere('n.isRead = true');

    const [items, total] = await qb
      .orderBy('n.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    // Summary Aggregations
    const totalNotifications = await this.notifRepo.count({
      where: { userId },
    });
    const unreadAlerts = await this.notifRepo.count({
      where: { userId, isRead: false },
    });
    const refundReqs = await this.notifRepo.count({
      where: { userId, category: 'refund_request', isRead: false },
    });
    const sysUpdates = await this.notifRepo.count({
      where: { userId, category: 'system_update', isRead: false },
    });

    // Ensure category array exists for safe .includes() checking
    const safeCategories = query.category || [];
    const safePriorities = query.priority || [];

    return {
      title: 'All Notifications',
      subtitle: 'Manage and review all system alerts and clinical updates.',
      canMarkAllRead: unreadAlerts > 0,
      settingsRoute: '/admin/settings/notifications',
      summary: {
        totalNotifications: { count: totalNotifications, label: 'Past 30d' },
        unreadAlerts: { count: unreadAlerts, label: 'Requires Action' },
        refundRequests: { count: refundReqs, label: 'Pending' },
        systemUpdates: { count: sysUpdates, label: 'Version 2.4.0' },
      },
      tabs: [
        {
          key: 'all',
          label: 'All Alerts',
          count: totalNotifications,
          isActive: query.status !== 'Unread Only',
        },
        {
          key: 'unread',
          label: 'Unread',
          count: unreadAlerts,
          isActive: query.status === 'Unread Only',
        },
        {
          key: 'critical',
          label: 'Critical',
          count: await this.notifRepo.count({
            where: { userId, priority: NotificationPriority.CRITICAL },
          }),
          isActive: false,
        },
        { key: 'system', label: 'System', count: sysUpdates, isActive: false },
      ],
      searchQuery: query.search || '',
      filterCount:
        (query.category?.length ? 1 : 0) +
        (query.priority?.length ? 1 : 0) +
        (query.status && query.status !== 'All' ? 1 : 0),
      hasActiveFilters: !!(
        query.category ||
        query.priority ||
        query.dateFrom ||
        (query.status && query.status !== 'All')
      ),

      // NEW: Added explicit Modal Filter Options matching the new UI Image
      filterOptions: {
        dateFrom: query.dateFrom || null,
        dateTo: query.dateTo || null,
        categoryOptions: [
          {
            label: 'System Maintenance',
            value: 'system_maintenance',
            selected: safeCategories.includes('system_maintenance'),
          },
          {
            label: 'Inventory & Shop',
            value: 'inventory_shop',
            selected: safeCategories.includes('inventory_shop'),
          },
          {
            label: 'Course Updates',
            value: 'course_updates',
            selected: safeCategories.includes('course_updates'),
          },
          {
            label: 'Urgent Alerts',
            value: 'urgent_alerts',
            selected: safeCategories.includes('urgent_alerts'),
          },
        ],
        status: query.status || 'All',
        statusOptions: ['All', 'Unread Only', 'Read Only'],
        priorityOptions: [
          {
            label: 'Critical',
            value: 'Critical',
            selected: safePriorities.includes('Critical'),
          },
          {
            label: 'High',
            value: 'High',
            selected: safePriorities.includes('High'),
          },
          {
            label: 'Routine',
            value: 'Routine',
            selected: safePriorities.includes('Routine'),
          },
        ],
        canReset: !!(
          query.category ||
          query.priority ||
          query.dateFrom ||
          (query.status && query.status !== 'All')
        ),
        canApply: true,
      },

      notifications: items.map((n) => ({
        id: n.id,
        title: n.title,
        message: n.message,
        category: n.category,
        type: n.type,
        priority: n.priority,
        isRead: n.isRead,
        createdAt: n.createdAt,
        timeLabel: this.getTimeLabel(n.createdAt),
        icon: n.icon,
        actionRoute: n.actionRoute,
        actionType: 'NAVIGATE',
        resourceId: n.resourceId,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        from: total === 0 ? 0 : (page - 1) * limit + 1,
        to: Math.min(page * limit, total),
        hasPrev: page > 1,
        hasNext: page * limit < total,
      },
    };
  }

  // ── 3. PREFERENCES ──
  async getPreferences(userId: string, email: string) {
    // Mocking the static structure expected by the UI. In production, merge this with DB values.
    return {
      title: 'Notification Preferences',
      subtitle:
        'Customize how and when you receive system alerts and institutional updates.',
      canSave: true,
      sections: [
        {
          id: 'sec_1',
          key: 'clinical_operations',
          title: 'CLINICAL OPERATIONS',
          icon: 'stethoscope',
          sortOrder: 1,
          items: [
            {
              id: 'pref_1',
              key: 'refund_requests',
              sectionKey: 'clinical_operations',
              title: 'Refund Requests',
              description:
                'Receive alerts when students request course tuition refunds.',
              inAppEnabled: true,
              emailEnabled: true,
              supportsFrequency: false,
              isEditable: true,
            },
            {
              id: 'pref_2',
              key: 'course_capacity',
              sectionKey: 'clinical_operations',
              title: 'Course Capacity',
              description:
                'Notifications when clinical sessions reach 90% or 100% capacity.',
              inAppEnabled: true,
              emailEnabled: false,
              supportsFrequency: false,
              isEditable: true,
            },
          ],
        },
        {
          id: 'sec_2',
          key: 'shop_inventory',
          title: 'SHOP & INVENTORY',
          icon: 'box',
          sortOrder: 2,
          items: [
            {
              id: 'pref_3',
              key: 'low_stock_alerts',
              sectionKey: 'shop_inventory',
              title: 'Low Stock Alerts',
              description:
                'Warning when inventory of specific medical supplies falls below threshold.',
              inAppEnabled: true,
              emailEnabled: true,
              supportsFrequency: true,
              frequency: 'Daily Digest',
              frequencyOptions: ['Immediate', 'Daily Digest', 'Weekly Digest'],
              isEditable: true,
            },
          ],
        },
      ],
      communicationChannels: {
        emailDeliveryAddress: email,
        emailDeliveryEditable: false,
        desktopPushSupported: true,
        desktopPushEnabled: true,
        desktopPushPermissionStatus: 'granted',
      },
    };
  }

  async updatePreferences(userId: string, dto: UpdatePreferencesDto) {
    // Process updates to the DB...
    for (const pref of dto.preferences) {
      let existing = await this.prefRepo.findOne({
        where: { userId, preferenceKey: pref.preferenceKey },
      });
      if (!existing)
        existing = this.prefRepo.create({
          userId,
          preferenceKey: pref.preferenceKey,
          sectionKey: 'default',
        });

      existing.inAppEnabled = pref.inAppEnabled;
      existing.emailEnabled = pref.emailEnabled;
      if (pref.frequency) existing.frequency = pref.frequency;

      await this.prefRepo.save(existing);
    }

    // Return exact Save Success Modal payload
    return {
      saveResult: {
        status: 'Active',
        channelsUpdated: ['In-App', 'Email'],
        frequencySummary: ['Daily Digest (Inventory)'],
        message:
          'Your notification preferences have been updated. You will now receive alerts based on your new configuration.',
      },
    };
  }

  async markAllAsRead(userId: string) {
    await this.notifRepo.update(
      { userId, isRead: false },
      { isRead: true, readAt: new Date() },
    );
    return { success: true };
  }

  // ── UTILS ──
  private getTimeLabel(date: Date): string {
    const diff = Math.floor((new Date().getTime() - date.getTime()) / 60000);
    if (diff < 60) return `${diff} minutes ago`;
    if (diff < 1440) return `${Math.floor(diff / 60)} hours ago`;
    return date.toLocaleDateString();
  }
}
