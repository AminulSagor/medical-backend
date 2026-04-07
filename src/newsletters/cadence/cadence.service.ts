import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { NewsletterCadenceSetting } from './entities/newsletter-cadence-settings.entity';
import {
  NewsletterBroadcastStatus,
  NewsletterChannelType,
  NewsletterFrequencyType,
} from 'src/common/enums/newsletter-constants.enum';
import { UpdateCadenceDto } from './dto/update-cadence.dto';
import { GetAvailableCadenceSlotsQueryDto } from './dto/get-available-cadence-slots-query.dto';
import { NewsletterBroadcast } from '../broadcasts/entities/newsletter-broadcast.entity';
import { NewsletterBroadcastQueueOrder } from '../broadcasts/entities/newsletter-broadcast-queue-order.entity';
import { buildCadenceSlots } from 'src/common/utils/newsletter-cadence-slots.util';
import { PreviewCadenceRecalculationDto } from './dto/preview-cadence-recalculation.dto';
import { ApplyCadenceRecalculationDto } from './dto/apply-cadence-recalculation.dto';
import { DateTime } from 'luxon';

@Injectable()
export class CadenceService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(NewsletterCadenceSetting)
    private readonly cadenceRepo: Repository<NewsletterCadenceSetting>,
    @InjectRepository(NewsletterBroadcast)
    private readonly broadcastRepo: Repository<NewsletterBroadcast>,
    @InjectRepository(NewsletterBroadcastQueueOrder)
    private readonly queueOrderRepo: Repository<NewsletterBroadcastQueueOrder>,
  ) {}

  async getCurrent(): Promise<Record<string, unknown>> {
    let cadence = await this.cadenceRepo.findOne({
      where: { channelType: NewsletterChannelType.GENERAL },
    });

    if (!cadence) {
      const defaultSettings = this.cadenceRepo.create({
        channelType: NewsletterChannelType.GENERAL,
        timezone: 'America/Chicago', // Your project's default timezone
        weeklyEnabled: true,
        monthlyEnabled: true,
        // The other fields will default to null based on your entity definition
      });
      cadence = await this.cadenceRepo.save(defaultSettings);
    }

    return {
      id: cadence.id,
      channelType: cadence.channelType,
      weeklyEnabled: cadence.weeklyEnabled,
      weeklyCycleStartDate: cadence.weeklyCycleStartDate,
      weeklyReleaseDay: cadence.weeklyReleaseDay,
      weeklyReleaseTime: cadence.weeklyReleaseTime,
      monthlyEnabled: cadence.monthlyEnabled,
      monthlyCycleStartDate: cadence.monthlyCycleStartDate,
      monthlyDayOfMonth: cadence.monthlyDayOfMonth,
      monthlyReleaseTime: cadence.monthlyReleaseTime,
      timezone: cadence.timezone,
      version: cadence.version,
      updatedAt: cadence.updatedAt,
    };
  }

  async update(
    adminUserId: string,
    dto: UpdateCadenceDto,
  ): Promise<Record<string, unknown>> {
    this.validate(dto);

    let cadence = await this.cadenceRepo.findOne({
      where: { channelType: NewsletterChannelType.GENERAL },
    });

    if (!cadence) {
      cadence = this.cadenceRepo.create({
        channelType: NewsletterChannelType.GENERAL,
      });
    }

    cadence.weeklyEnabled = dto.weeklyEnabled;
    cadence.weeklyCycleStartDate = dto.weeklyEnabled
      ? (dto.weeklyCycleStartDate ?? null)
      : null;
    cadence.weeklyReleaseDay = dto.weeklyEnabled
      ? (dto.weeklyReleaseDay ?? null)
      : null;
    cadence.weeklyReleaseTime = dto.weeklyEnabled
      ? (dto.weeklyReleaseTime ?? null)
      : null;

    cadence.monthlyEnabled = dto.monthlyEnabled;
    cadence.monthlyCycleStartDate = dto.monthlyEnabled
      ? (dto.monthlyCycleStartDate ?? null)
      : null;
    cadence.monthlyDayOfMonth = dto.monthlyEnabled
      ? (dto.monthlyDayOfMonth ?? null)
      : null;
    cadence.monthlyReleaseTime = dto.monthlyEnabled
      ? (dto.monthlyReleaseTime ?? null)
      : null;

    cadence.timezone = dto.timezone.trim();
    cadence.updatedByAdminId = adminUserId;
    cadence.version = (cadence.version ?? 0) + 1;

    const saved = await this.cadenceRepo.save(cadence);

    return {
      message: 'General newsletter cadence updated successfully',
      id: saved.id,
      identifier: saved.timezone,
      version: saved.version,
    };
  }

  async getAvailableSlots(
    query: GetAvailableCadenceSlotsQueryDto,
  ): Promise<Record<string, unknown>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const cadence = await this.cadenceRepo.findOne({
      where: { channelType: NewsletterChannelType.GENERAL },
    });

    if (!cadence) {
      throw new NotFoundException(
        'General newsletter cadence settings not found',
      );
    }

    // Validation checks for enabled frequencies
    if (
      query.frequencyType === NewsletterFrequencyType.WEEKLY &&
      !cadence.weeklyEnabled
    ) {
      throw new UnprocessableEntityException('Weekly cadence is disabled');
    }

    if (
      query.frequencyType === NewsletterFrequencyType.MONTHLY &&
      !cadence.monthlyEnabled
    ) {
      throw new UnprocessableEntityException('Monthly cadence is disabled');
    }

    // Determine range from year/month if provided
    let fromDate = query.fromDate;
    let toDate = query.toDate;

    if (query.year && query.month && !fromDate && !toDate) {
      const dt = DateTime.fromObject(
        { year: query.year, month: query.month },
        { zone: cadence.timezone },
      );
      fromDate = dt.startOf('month').toISODate()!;
      toDate = dt.endOf('month').toISODate()!;
    }

    // Generate a larger pool of candidates to allow pagination
    const allCandidateSlots = buildCadenceSlots({
      timezone: cadence.timezone,
      frequencyType: query.frequencyType,
      fromDate,
      toDate,
      count: 100, // Generate up to 100 slots to support pagination
      weekly: {
        enabled: cadence.weeklyEnabled,
        releaseDay: cadence.weeklyReleaseDay,
        releaseTime: cadence.weeklyReleaseTime,
      },
      monthly: {
        enabled: cadence.monthlyEnabled,
        dayOfMonth: cadence.monthlyDayOfMonth,
        releaseTime: cadence.monthlyReleaseTime,
      },
    });

    // Apply manual pagination to the generated array
    const total = allCandidateSlots.length;
    const paginatedSlots = allCandidateSlots.slice(
      (page - 1) * limit,
      page * limit,
    );

    const slotIsoList = paginatedSlots.map((s) => s.scheduledAtUtc);
    let occupiedMap = new Map<
      string,
      { broadcastId: string; subjectLine: string }
    >();

    // Check which of the paginated slots are already occupied
    if (slotIsoList.length) {
      const occupied = await this.broadcastRepo.find({
        where: {
          channelType: NewsletterChannelType.GENERAL,
          status: NewsletterBroadcastStatus.SCHEDULED,
          frequencyType: query.frequencyType,
          scheduledAt: In(slotIsoList.map((d) => new Date(d))),
        } as any,
        select: ['id', 'subjectLine', 'scheduledAt'],
      });

      occupiedMap = new Map(
        occupied.map((o) => [
          o.scheduledAt!.toISOString(),
          { broadcastId: o.id, subjectLine: o.subjectLine },
        ]),
      );
    }

    return {
      items: paginatedSlots.map((slot) => ({
        ...slot,
        isAvailable: !occupiedMap.has(slot.scheduledAtUtc),
        occupiedBy: occupiedMap.get(slot.scheduledAtUtc) ?? null,
      })),
      meta: {
        page,
        limit,
        total,
      },
      frequencyType: query.frequencyType,
      timezone: cadence.timezone,
    };
  }

  async previewRecalculation(
    dto: PreviewCadenceRecalculationDto,
  ): Promise<Record<string, unknown>> {
    this.validate(dto);

    const queuedBroadcasts = await this.broadcastRepo.find({
      where: {
        channelType: NewsletterChannelType.GENERAL,
        status: NewsletterBroadcastStatus.SCHEDULED,
      },
      select: [
        'id',
        'subjectLine',
        'frequencyType',
        'scheduledAt',
        'timezone',
        'cadenceAnchorLabel',
      ],
      order: { scheduledAt: 'ASC' },
      take: 500,
    });

    const weeklyRows = queuedBroadcasts.filter(
      (b) => b.frequencyType === NewsletterFrequencyType.WEEKLY,
    );
    const monthlyRows = queuedBroadcasts.filter(
      (b) => b.frequencyType === NewsletterFrequencyType.MONTHLY,
    );

    const weeklySlots = buildCadenceSlots({
      timezone: dto.timezone,
      frequencyType: NewsletterFrequencyType.WEEKLY,
      count: Math.max(weeklyRows.length + 5, 20),
      weekly: {
        enabled: dto.weeklyEnabled,
        releaseDay: dto.weeklyReleaseDay,
        releaseTime: dto.weeklyReleaseTime,
      },
      monthly: { enabled: false },
    });

    const monthlySlots = buildCadenceSlots({
      timezone: dto.timezone,
      frequencyType: NewsletterFrequencyType.MONTHLY,
      count: Math.max(monthlyRows.length + 5, 20),
      monthly: {
        enabled: dto.monthlyEnabled,
        dayOfMonth: dto.monthlyDayOfMonth,
        releaseTime: dto.monthlyReleaseTime,
      },
      weekly: { enabled: false },
    });

    const weeklyImpacts = weeklyRows.map((b, idx) => ({
      broadcastId: b.id,
      subjectLine: b.subjectLine,
      frequencyType: b.frequencyType,
      oldScheduledAtUtc: b.scheduledAt?.toISOString() ?? null,
      newScheduledAtUtc: weeklySlots[idx]?.scheduledAtUtc ?? null,
      changed:
        (b.scheduledAt?.toISOString() ?? null) !==
        (weeklySlots[idx]?.scheduledAtUtc ?? null),
    }));

    const monthlyImpacts = monthlyRows.map((b, idx) => ({
      broadcastId: b.id,
      subjectLine: b.subjectLine,
      frequencyType: b.frequencyType,
      oldScheduledAtUtc: b.scheduledAt?.toISOString() ?? null,
      newScheduledAtUtc: monthlySlots[idx]?.scheduledAtUtc ?? null,
      changed:
        (b.scheduledAt?.toISOString() ?? null) !==
        (monthlySlots[idx]?.scheduledAtUtc ?? null),
    }));

    const all = [...weeklyImpacts, ...monthlyImpacts];
    const changedCount = all.filter((x) => x.changed).length;

    return {
      summary: {
        totalScheduledQueued: all.length,
        changedCount,
        unchangedCount: all.length - changedCount,
        timezone: dto.timezone,
      },
      impacts: all.slice(0, 100), // UI preview list
      truncated: all.length > 100,
    };
  }

  async applyWithRecalculation(
    adminUserId: string,
    dto: ApplyCadenceRecalculationDto,
  ): Promise<Record<string, unknown>> {
    this.validate(dto);

    const preview = await this.previewRecalculation(dto);

    const cadenceBefore = await this.cadenceRepo.findOne({
      where: { channelType: NewsletterChannelType.GENERAL },
    });

    let cadence = cadenceBefore;
    if (!cadence) {
      cadence = this.cadenceRepo.create({
        channelType: NewsletterChannelType.GENERAL,
      });
    }

    return this.dataSource.transaction(async (manager) => {
      cadence!.weeklyEnabled = dto.weeklyEnabled;
      cadence.weeklyCycleStartDate = dto.weeklyEnabled
        ? (dto.weeklyCycleStartDate ?? null)
        : null;
      cadence.weeklyReleaseDay = dto.weeklyEnabled
        ? (dto.weeklyReleaseDay ?? null)
        : null;
      cadence.weeklyReleaseTime = dto.weeklyEnabled
        ? (dto.weeklyReleaseTime ?? null)
        : null;

      cadence!.monthlyEnabled = dto.monthlyEnabled;
      cadence.monthlyCycleStartDate = dto.monthlyEnabled
        ? (dto.monthlyCycleStartDate ?? null)
        : null;
      cadence.monthlyDayOfMonth = dto.monthlyEnabled
        ? (dto.monthlyDayOfMonth ?? null)
        : null;
      cadence.monthlyReleaseTime = dto.monthlyEnabled
        ? (dto.monthlyReleaseTime ?? null)
        : null;

      cadence!.timezone = dto.timezone.trim();
      cadence!.updatedByAdminId = adminUserId;
      cadence!.version = (cadence!.version ?? 0) + 1;

      const savedCadence = await manager.save(
        NewsletterCadenceSetting,
        cadence!,
      );

      if (dto.recalculateScheduledQueue !== false) {
        const queued = await manager.find(NewsletterBroadcast, {
          where: {
            channelType: NewsletterChannelType.GENERAL,
            status: NewsletterBroadcastStatus.SCHEDULED,
          },
          select: ['id', 'frequencyType', 'scheduledAt', 'subjectLine'],
          order: { scheduledAt: 'ASC' },
          take: 500,
        });

        const weekly = queued.filter(
          (b) => b.frequencyType === NewsletterFrequencyType.WEEKLY,
        );
        const monthly = queued.filter(
          (b) => b.frequencyType === NewsletterFrequencyType.MONTHLY,
        );

        const weeklySlots = dto.weeklyEnabled
          ? buildCadenceSlots({
              timezone: dto.timezone,
              frequencyType: NewsletterFrequencyType.WEEKLY,
              count: Math.max(weekly.length + 5, 20),
              weekly: {
                enabled: dto.weeklyEnabled,
                releaseDay: dto.weeklyReleaseDay,
                releaseTime: dto.weeklyReleaseTime,
              },
              monthly: { enabled: false },
            })
          : [];

        const monthlySlots = dto.monthlyEnabled
          ? buildCadenceSlots({
              timezone: dto.timezone,
              frequencyType: NewsletterFrequencyType.MONTHLY,
              count: Math.max(monthly.length + 5, 20),
              monthly: {
                enabled: dto.monthlyEnabled,
                dayOfMonth: dto.monthlyDayOfMonth,
                releaseTime: dto.monthlyReleaseTime,
              },
              weekly: { enabled: false },
            })
          : [];

        for (let i = 0; i < weekly.length; i++) {
          if (!weeklySlots[i]) continue;
          weekly[i].scheduledAt = new Date(weeklySlots[i].scheduledAtUtc);
          weekly[i].timezone = dto.timezone;
          weekly[i].cadenceVersionAtScheduling = savedCadence.version;
        }

        for (let i = 0; i < monthly.length; i++) {
          if (!monthlySlots[i]) continue;
          monthly[i].scheduledAt = new Date(monthlySlots[i].scheduledAtUtc);
          monthly[i].timezone = dto.timezone;
          monthly[i].cadenceVersionAtScheduling = savedCadence.version;
        }

        if (weekly.length) await manager.save(NewsletterBroadcast, weekly);
        if (monthly.length) await manager.save(NewsletterBroadcast, monthly);
      }

      return {
        message: 'General newsletter cadence updated successfully',
        id: savedCadence.id,
        identifier: savedCadence.timezone,
        version: savedCadence.version,
        recalculation: preview.summary,
      };
    });
  }

  private validate(dto: UpdateCadenceDto): void {
    if (!dto.weeklyEnabled && !dto.monthlyEnabled) {
      throw new BadRequestException(
        'At least one cadence (weekly/monthly) must be enabled',
      );
    }

    if (!dto.timezone?.trim()) {
      throw new BadRequestException('timezone is required');
    }

    if (dto.weeklyEnabled) {
      if (
        !dto.weeklyCycleStartDate ||
        !dto.weeklyReleaseDay ||
        !dto.weeklyReleaseTime
      ) {
        throw new BadRequestException(
          'weeklyCycleStartDate, weeklyReleaseDay and weeklyReleaseTime are required when weeklyEnabled is true',
        );
      }
    }

    if (dto.monthlyEnabled) {
      if (
        !dto.monthlyCycleStartDate ||
        !dto.monthlyDayOfMonth ||
        !dto.monthlyReleaseTime
      ) {
        throw new BadRequestException(
          'monthlyCycleStartDate, monthlyDayOfMonth and monthlyReleaseTime are required when monthlyEnabled is true',
        );
      }
    }
  }
}
