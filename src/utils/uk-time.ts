import { DateTime } from 'luxon';

/** IANA zone for UK civil time (GMT / BST). */
export const UK_TZ = 'Europe/London';

/** Maximum inclusive day span for host schedule queries (from → to). */
export const HOST_SCHEDULE_MAX_RANGE_DAYS = 31;

export type ActivityDateTimeRangeLike = {
  startDateTime?: Date | string | null;
  endDateTime?: Date | string | null;
  date?: Date | string | null;
  time?: string | null;
  endTime?: string | null;
};

/**
 * Parse activity `time` strings such as "14:00", "2:00 PM", "9:30am".
 * Returns null if the string cannot be parsed.
 */
export function parseActivityTimeString(
  timeStr: string,
): { hour: number; minute: number } | null {
  if (!timeStr || typeof timeStr !== 'string') {
    return null;
  }
  const s = timeStr.trim();
  if (!s) {
    return null;
  }

  const m24 = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (m24) {
    const hour = parseInt(m24[1], 10);
    const minute = parseInt(m24[2], 10);
    if (
      Number.isFinite(hour) &&
      Number.isFinite(minute) &&
      hour >= 0 &&
      hour <= 23 &&
      minute >= 0 &&
      minute <= 59
    ) {
      return { hour, minute };
    }
    return null;
  }

  const m12 = /^(\d{1,2}):(\d{2})\s*([aApP])\.?\s*([mM])\.?$/.exec(s);
  if (m12) {
    let hour = parseInt(m12[1], 10);
    const minute = parseInt(m12[2], 10);
    const ap = (m12[3] + m12[4]).toLowerCase();
    if (
      !Number.isFinite(hour) ||
      !Number.isFinite(minute) ||
      hour < 1 ||
      hour > 12 ||
      minute < 0 ||
      minute > 59
    ) {
      return null;
    }
    const isPm = ap === 'pm';
    const isAm = ap === 'am';
    if (!isPm && !isAm) {
      return null;
    }
    if (hour === 12) {
      hour = isPm ? 12 : 0;
    } else if (isPm) {
      hour += 12;
    }
    return { hour, minute };
  }

  return null;
}

/**
 * Combine stored activity `date` (UTC instant from DB) with local `time` string
 * into a Europe/London DateTime for the scheduled start.
 */
export function activityStartDateTimeLondon(
  activityDate: Date,
  timeStr: string,
): DateTime | null {
  const parsed = parseActivityTimeString(timeStr);
  if (!parsed) {
    return null;
  }
  const londonCal = DateTime.fromJSDate(activityDate, {
    zone: 'utc',
  }).setZone(UK_TZ);
  return DateTime.fromObject(
    {
      year: londonCal.year,
      month: londonCal.month,
      day: londonCal.day,
      hour: parsed.hour,
      minute: parsed.minute,
      second: 0,
      millisecond: 0,
    },
    { zone: UK_TZ },
  );
}

/**
 * Convert a UK-local ISO datetime string into a UTC Date for storage.
 * The input is expected to be a 24-hour datetime without a timezone offset.
 */
export function ukLocalDateTimeToUtcDate(
  localDateTimeIso: string,
): Date | null {
  if (!localDateTimeIso || typeof localDateTimeIso !== 'string') {
    return null;
  }

  const parsed = DateTime.fromISO(localDateTimeIso, { zone: UK_TZ });
  if (!parsed.isValid) {
    return null;
  }

  return parsed.toUTC().toJSDate();
}

/**
 * Resolve a stored activity datetime into Europe/London wall time.
 */
export function storedActivityDateTimeLondon(
  value: Date | string | null | undefined,
): DateTime | null {
  if (!value) {
    return null;
  }

  const dateValue = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dateValue.getTime())) {
    return null;
  }

  return DateTime.fromJSDate(dateValue, { zone: 'utc' }).setZone(UK_TZ);
}

/**
 * Resolve the start/end datetime pair for an activity, with legacy fallback.
 */
export function activityDateTimeRangeLondon(
  activity: ActivityDateTimeRangeLike,
): {
  start: DateTime | null;
  end: DateTime | null;
} {
  const start = storedActivityDateTimeLondon(
    activity.startDateTime ?? activity.date,
  );
  const end = storedActivityDateTimeLondon(activity.endDateTime);

  if (start && end) {
    return { start, end };
  }

  if (activity.date && activity.time) {
    const legacyStart = activityStartDateTimeLondon(
      new Date(activity.date),
      activity.time,
    );
    const legacyEnd = activity.endTime
      ? activityStartDateTimeLondon(new Date(activity.date), activity.endTime)
      : null;

    return { start: legacyStart, end: legacyEnd };
  }

  return { start, end };
}

/**
 * Iterate each calendar day in Europe/London from `fromIso` through `toIso` (inclusive).
 * `fromIso` / `toIso` should be date-only strings (YYYY-MM-DD).
 */
export function* eachLondonDayInclusive(
  fromIso: string,
  toIso: string,
): Generator<DateTime> {
  let cursor = DateTime.fromISO(fromIso, { zone: UK_TZ }).startOf('day');
  const end = DateTime.fromISO(toIso, { zone: UK_TZ }).startOf('day');
  if (!cursor.isValid || !end.isValid) {
    return;
  }
  while (cursor <= end) {
    yield cursor;
    cursor = cursor.plus({ days: 1 });
  }
}
