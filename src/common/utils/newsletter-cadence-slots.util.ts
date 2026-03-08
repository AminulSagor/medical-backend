import { DateTime } from 'luxon';
import { NewsletterFrequencyType } from '../enums/newsletter-constants.enum';

type WeeklyParams = {
  enabled: boolean;
  releaseDay?: string | null; // SUNDAY ...
  releaseTime?: string | null; // HH:mm:ss
};

type MonthlyParams = {
  enabled: boolean;
  dayOfMonth?: number | null;
  releaseTime?: string | null; // HH:mm:ss
};

type BuildSlotsInput = {
  timezone: string;
  frequencyType: NewsletterFrequencyType;
  fromDate?: string;
  toDate?: string;
  count?: number;
  weekly: WeeklyParams;
  monthly: MonthlyParams;
};

const WEEKDAY_MAP: Record<string, number> = {
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
  SUNDAY: 7,
};

function parseHms(value: string): {
  hour: number;
  minute: number;
  second: number;
} {
  const [h, m, s] = value.split(':').map(Number);
  return { hour: h, minute: m, second: s };
}

export function buildCadenceSlots(input: BuildSlotsInput): Array<{
  scheduledAtUtc: string;
  scheduledAtLocalIso: string;
  scheduledAtLocalLabel: string;
}> {
  const timezone = input.timezone;
  const now = DateTime.now().setZone(timezone);
  const from = input.fromDate
    ? DateTime.fromISO(input.fromDate, { zone: timezone }).startOf('day')
    : now.startOf('day');
  const to = input.toDate
    ? DateTime.fromISO(input.toDate, { zone: timezone }).endOf('day')
    : null;

  const result: Array<{
    scheduledAtUtc: string;
    scheduledAtLocalIso: string;
    scheduledAtLocalLabel: string;
  }> = [];

  const maxCount = input.count ?? 20;

  if (input.frequencyType === NewsletterFrequencyType.WEEKLY) {
    if (
      !input.weekly.enabled ||
      !input.weekly.releaseDay ||
      !input.weekly.releaseTime
    )
      return result;

    const targetWeekday = WEEKDAY_MAP[input.weekly.releaseDay];
    const { hour, minute, second } = parseHms(input.weekly.releaseTime);

    let cursor = from.set({ hour, minute, second, millisecond: 0 });

    while (cursor.weekday !== targetWeekday) {
      cursor = cursor.plus({ days: 1 });
    }

    while (result.length < maxCount) {
      if (to && cursor > to) break;
      if (cursor >= now.minus({ minutes: 1 })) {
        result.push({
          scheduledAtUtc: cursor.toUTC().toISO()!,
          scheduledAtLocalIso: cursor.toISO()!,
          scheduledAtLocalLabel: cursor.toFormat(
            'ccc, LLL dd, yyyy hh:mm a ZZZZ',
          ),
        });
      }
      cursor = cursor.plus({ weeks: 1 });
    }

    return result;
  }

  if (
    !input.monthly.enabled ||
    !input.monthly.dayOfMonth ||
    !input.monthly.releaseTime
  )
    return result;

  const { hour, minute, second } = parseHms(input.monthly.releaseTime);
  let cursor = from.startOf('month');

  while (result.length < maxCount) {
    const daysInMonth = cursor.daysInMonth ?? cursor.endOf('month').day; // always number
    const dayOfMonth = input.monthly.dayOfMonth ?? 1;
    const day = Math.min(dayOfMonth, daysInMonth);
    const slot = cursor.set({
      day,
      hour,
      minute,
      second,
      millisecond: 0,
    });

    if (
      (!to || slot <= to) &&
      slot >= now.minus({ minutes: 1 }) &&
      slot >= from
    ) {
      result.push({
        scheduledAtUtc: slot.toUTC().toISO()!,
        scheduledAtLocalIso: slot.toISO()!,
        scheduledAtLocalLabel: slot.toFormat('ccc, LLL dd, yyyy hh:mm a ZZZZ'),
      });
    }

    cursor = cursor.plus({ months: 1 }).startOf('month');
    if (to && cursor > to.endOf('month')) break;
  }

  return result;
}
