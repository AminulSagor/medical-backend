import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NewsletterCadenceSetting } from './entities/newsletter-cadence-settings.entity';
import {
  NewsletterChannelType,
  NewsletterFrequencyType,
} from 'src/common/enums/newsletter-constants.enum';
import { UpdateCadenceDto } from './dto/update-cadence.dto';
import { GetAvailableCadenceSlotsQueryDto } from './dto/get-available-cadence-slots-query.dto';

@Injectable()
export class CadenceService {
  constructor(
    @InjectRepository(NewsletterCadenceSetting)
    private readonly cadenceRepo: Repository<NewsletterCadenceSetting>,
  ) {}

  async getCurrent(): Promise<Record<string, unknown>> {
    const cadence = await this.cadenceRepo.findOne({
      where: { channelType: NewsletterChannelType.GENERAL },
    });

    if (!cadence) {
      throw new NotFoundException(
        'General newsletter cadence settings not found',
      );
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
      ? dto.weeklyCycleStartDate
      : null;
    cadence.weeklyReleaseDay = dto.weeklyEnabled ? dto.weeklyReleaseDay : null;
    cadence.weeklyReleaseTime = dto.weeklyEnabled
      ? dto.weeklyReleaseTime
      : null;

    cadence.monthlyEnabled = dto.monthlyEnabled;
    cadence.monthlyCycleStartDate = dto.monthlyEnabled
      ? dto.monthlyCycleStartDate
      : null;
    cadence.monthlyDayOfMonth = dto.monthlyEnabled
      ? dto.monthlyDayOfMonth
      : null;
    cadence.monthlyReleaseTime = dto.monthlyEnabled
      ? dto.monthlyReleaseTime
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
    const cadence = await this.cadenceRepo.findOne({
      where: { channelType: NewsletterChannelType.GENERAL },
    });

    if (!cadence) {
      throw new NotFoundException(
        'General newsletter cadence settings not found',
      );
    }

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

    const now = new Date();
    const slots: Array<Record<string, unknown>> = [];

    for (let i = 1; i <= 12; i++) {
      const dt = new Date(now);
      if (query.frequencyType === NewsletterFrequencyType.WEEKLY) {
        dt.setDate(dt.getDate() + i * 7);
      } else {
        dt.setMonth(dt.getMonth() + i);
      }

      slots.push({
        scheduledAtUtc: dt.toISOString(),
        scheduledAtLocalLabel: dt.toUTCString(), // replace with timezone formatting later
        isAvailable: true,
      });
    }

    return {
      frequencyType: query.frequencyType,
      timezone: cadence.timezone,
      slots,
    };
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
