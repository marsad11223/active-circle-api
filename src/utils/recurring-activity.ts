import { DateTime } from 'luxon';
import { RecurringType } from 'src/schemas/activity.schema';
import { UK_TZ } from 'src/utils/uk-time';

/**
 * When a monthly series is anchored on day 31, shorter months use the last
 * calendar day (e.g. Jan 31 → Feb 28/29). Luxon `plus({ months: 1 })` on
 * Jan 31 yields Feb 28/29; this constant documents that explicit policy.
 */
export const MONTHLY_DAY_CLAMP_POLICY = 'last_day_of_month' as const;

export type MonthlyDayClampPolicy = typeof MONTHLY_DAY_CLAMP_POLICY;

export type RecurringScheduleRule = {
  /** Luxon weekday 1–7 (Monday–Sunday); required for weekly series. */
  dayOfWeek?: number;
  /** Calendar day 1–31; required for monthly series. Shorter months clamp per MONTHLY_DAY_CLAMP_POLICY. */
  dayOfMonth?: number;
  startTime: string;
  durationMinutes: number;
  timezone: string;
};

export function isRecurringType(
  recurring: RecurringType | undefined | null,
): boolean {
  return (
    recurring !== undefined &&
    recurring !== null &&
    recurring !== RecurringType.ONE_TIME
  );
}

export function deriveScheduleRuleFromOccurrence(
  startDateTime: Date,
  endDateTime: Date,
  recurring: RecurringType,
  timezone: string = UK_TZ,
): RecurringScheduleRule {
  const start = DateTime.fromJSDate(startDateTime, { zone: 'utc' }).setZone(
    timezone,
  );
  const end = DateTime.fromJSDate(endDateTime, { zone: 'utc' }).setZone(
    timezone,
  );

  if (!start.isValid || !end.isValid) {
    throw new Error('Invalid start or end datetime for schedule rule derivation');
  }

  const durationMinutes = Math.round(end.diff(start, 'minutes').minutes);
  if (durationMinutes <= 0) {
    throw new Error('Duration must be positive');
  }

  const rule: RecurringScheduleRule = {
    startTime: start.toFormat('HH:mm'),
    durationMinutes,
    timezone,
  };

  if (recurring === RecurringType.WEEKLY) {
    rule.dayOfWeek = start.weekday;
  } else if (recurring === RecurringType.MONTHLY) {
    rule.dayOfMonth = start.day;
  }

  return rule;
}

const RECURRING_SERIES_TYPES = [
  RecurringType.DAILY,
  RecurringType.WEEKLY,
  RecurringType.MONTHLY,
  RecurringType.YEARLY,
] as const;

export function isRecurringSeriesType(
  recurring: RecurringType,
): recurring is (typeof RECURRING_SERIES_TYPES)[number] {
  return (RECURRING_SERIES_TYPES as readonly RecurringType[]).includes(
    recurring,
  );
}

export function normalizeScheduleRuleForRecurring(
  recurring: RecurringType,
  rule: RecurringScheduleRule,
  anchorStartDateTime?: Date,
): RecurringScheduleRule {
  const tz = rule.timezone || UK_TZ;
  const normalized: RecurringScheduleRule = { ...rule, timezone: tz };

  if (anchorStartDateTime) {
    const anchor = DateTime.fromJSDate(anchorStartDateTime, {
      zone: 'utc',
    }).setZone(tz);

    if (recurring === RecurringType.WEEKLY && normalized.dayOfWeek == null) {
      normalized.dayOfWeek = anchor.weekday;
    }

    if (recurring === RecurringType.MONTHLY && normalized.dayOfMonth == null) {
      normalized.dayOfMonth = anchor.day;
    }
  }

  if (recurring !== RecurringType.WEEKLY) {
    delete normalized.dayOfWeek;
  }

  if (recurring !== RecurringType.MONTHLY) {
    delete normalized.dayOfMonth;
  }

  return normalized;
}

/** Apply weekly day-of-week + wall-clock start time in the series timezone. */
export function applyWeeklyScheduleSlot(
  base: DateTime,
  scheduleRule: RecurringScheduleRule,
): DateTime {
  if (scheduleRule.dayOfWeek == null) {
    throw new Error('dayOfWeek is required for weekly recurrence');
  }

  const withDay = base.set({
    weekday: scheduleRule.dayOfWeek as 1 | 2 | 3 | 4 | 5 | 6 | 7,
  });
  return applyStartTime(withDay, scheduleRule);
}

/** Apply monthly day-of-month + wall-clock start time in the series timezone. */
export function applyMonthlyScheduleSlot(
  base: DateTime,
  scheduleRule: RecurringScheduleRule,
): DateTime {
  if (scheduleRule.dayOfMonth == null) {
    throw new Error('dayOfMonth is required for monthly recurrence');
  }

  const daysInMonth = base.daysInMonth ?? scheduleRule.dayOfMonth;
  const day = Math.min(scheduleRule.dayOfMonth, daysInMonth);
  const withDay = base.set({ day });
  return applyStartTime(withDay, scheduleRule);
}

export function toPersistedScheduleRule(
  recurring: RecurringType,
  rule: RecurringScheduleRule,
): RecurringScheduleRule {
  const persisted: RecurringScheduleRule = {
    startTime: rule.startTime,
    durationMinutes: rule.durationMinutes,
    timezone: rule.timezone || UK_TZ,
  };

  if (recurring === RecurringType.WEEKLY && rule.dayOfWeek != null) {
    persisted.dayOfWeek = rule.dayOfWeek;
  }

  if (recurring === RecurringType.MONTHLY && rule.dayOfMonth != null) {
    persisted.dayOfMonth = rule.dayOfMonth;
  }

  return persisted;
}

export function scheduleRuleMongoUpdates(
  recurring: RecurringType,
  rule: RecurringScheduleRule,
): {
  set: Record<string, string | number>;
  unset: Record<string, ''>;
} {
  const persisted = toPersistedScheduleRule(recurring, rule);
  const set: Record<string, string | number> = {
    'scheduleRule.startTime': persisted.startTime,
    'scheduleRule.durationMinutes': persisted.durationMinutes,
    'scheduleRule.timezone': persisted.timezone,
  };
  const unset: Record<string, ''> = {
    'scheduleRule.dayOfWeek': '',
    'scheduleRule.dayOfMonth': '',
  };

  if (persisted.dayOfWeek != null) {
    set['scheduleRule.dayOfWeek'] = persisted.dayOfWeek;
    delete unset['scheduleRule.dayOfWeek'];
  }

  if (persisted.dayOfMonth != null) {
    set['scheduleRule.dayOfMonth'] = persisted.dayOfMonth;
    delete unset['scheduleRule.dayOfMonth'];
  }

  return { set, unset };
}

export function assertValidScheduleRuleForRecurring(
  recurring: RecurringType,
  rule: RecurringScheduleRule,
): void {
  if (!isRecurringSeriesType(recurring)) {
    throw new Error(`Invalid recurring series type: ${recurring}`);
  }

  if (!rule.startTime || !rule.timezone) {
    throw new Error('scheduleRule requires startTime and timezone');
  }

  if (!Number.isFinite(rule.durationMinutes) || rule.durationMinutes <= 0) {
    throw new Error('scheduleRule.durationMinutes must be a positive number');
  }

  if (recurring === RecurringType.WEEKLY && rule.dayOfWeek == null) {
    throw new Error('dayOfWeek is required for weekly series');
  }

  if (recurring === RecurringType.MONTHLY && rule.dayOfMonth == null) {
    throw new Error('dayOfMonth is required for monthly series');
  }
}

function applyStartTime(base: DateTime, rule: RecurringScheduleRule): DateTime {
  const [hourStr, minuteStr] = rule.startTime.split(':');
  const hour = Number(hourStr);
  const minute = Number(minuteStr);

  if (
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    throw new Error(`Invalid startTime in schedule rule: ${rule.startTime}`);
  }

  return base.set({
    hour,
    minute,
    second: 0,
    millisecond: 0,
  });
}

/**
 * Advance one recurrence period from the anchor, preserving schedule wall time.
 */
export function computeNextOccurrenceStart(
  recurring: RecurringType,
  scheduleRule: RecurringScheduleRule,
  anchorStartDateTime: Date,
): Date {
  const tz = scheduleRule.timezone || UK_TZ;
  const anchor = DateTime.fromJSDate(anchorStartDateTime, { zone: 'utc' }).setZone(
    tz,
  );

  if (!anchor.isValid) {
    throw new Error('Invalid anchor start datetime');
  }

  let next: DateTime;

  switch (recurring) {
    case RecurringType.DAILY:
      next = anchor.plus({ days: 1 });
      break;
    case RecurringType.WEEKLY: {
      if (scheduleRule.dayOfWeek == null) {
        throw new Error('dayOfWeek is required for weekly recurrence');
      }
      next = anchor.plus({ days: 1 });
      for (let i = 0; i < 7; i++) {
        if (next.weekday === scheduleRule.dayOfWeek) {
          break;
        }
        next = next.plus({ days: 1 });
      }
      break;
    }
    case RecurringType.MONTHLY: {
      if (scheduleRule.dayOfMonth == null) {
        throw new Error('dayOfMonth is required for monthly recurrence');
      }
      return applyMonthlyScheduleSlot(anchor.plus({ months: 1 }), scheduleRule)
        .toUTC()
        .toJSDate();
    }
    case RecurringType.YEARLY:
      next = anchor.plus({ years: 1 });
      break;
    default:
      throw new Error(`Cannot compute next occurrence for ${recurring}`);
  }

  next = applyStartTime(next, scheduleRule);
  return next.toUTC().toJSDate();
}

/**
 * Repeatedly advance until the slot is strictly after `anchorStartDateTime`
 * and at or after `nowUtc` (for cron catch-up).
 */
export function fastForwardToFuture(
  recurring: RecurringType,
  scheduleRule: RecurringScheduleRule,
  anchorStartDateTime: Date,
  nowUtc: Date = new Date(),
  maxIterations = 400,
): Date {
  let cursor = anchorStartDateTime;
  let next = computeNextOccurrenceStart(recurring, scheduleRule, cursor);
  let iterations = 0;

  while (
    iterations < maxIterations &&
    (next <= anchorStartDateTime || next < nowUtc)
  ) {
    cursor = next;
    next = computeNextOccurrenceStart(recurring, scheduleRule, cursor);
    iterations++;
  }

  if (iterations >= maxIterations) {
    throw new Error('Exceeded maximum fast-forward iterations');
  }

  return next;
}

/**
 * Earliest UTC instant the public schedule should show for a series.
 * Never preview virtual slots before the next bookable session.
 */
export function getSeriesScheduleFloorUtc(
  recurring: RecurringType,
  scheduleRule: RecurringScheduleRule,
  lastOccurrenceStartDateTime: Date,
  nowUtc: Date = new Date(),
  futureActiveStartDateTime?: Date | null,
): Date {
  if (futureActiveStartDateTime) {
    return futureActiveStartDateTime;
  }

  if (!isScheduleRuleCompleteForRecurring(recurring, scheduleRule)) {
    return nowUtc;
  }

  try {
    return fastForwardToFuture(
      recurring,
      scheduleRule,
      lastOccurrenceStartDateTime,
      nowUtc,
    );
  } catch {
    return nowUtc;
  }
}

export function buildOccurrenceEndDateTime(
  startDateTime: Date,
  scheduleRule: RecurringScheduleRule,
): Date {
  return DateTime.fromJSDate(startDateTime, { zone: 'utc' })
    .plus({ minutes: scheduleRule.durationMinutes })
    .toUTC()
    .toJSDate();
}

/** Map an instant to the canonical slot for a series (day + wall time from scheduleRule). */
export function canonicalOccurrenceStart(
  startDateTime: Date,
  recurring: RecurringType,
  scheduleRule: RecurringScheduleRule,
): Date {
  const tz = scheduleRule.timezone || UK_TZ;
  const local = DateTime.fromJSDate(startDateTime, { zone: 'utc' }).setZone(tz);

  if (!local.isValid) {
    throw new Error('Invalid occurrence start datetime');
  }

  let realigned: DateTime;

  switch (recurring) {
    case RecurringType.WEEKLY:
      realigned = applyWeeklyScheduleSlot(local, scheduleRule);
      break;
    case RecurringType.MONTHLY:
      realigned = applyMonthlyScheduleSlot(local, scheduleRule);
      break;
    case RecurringType.DAILY:
    case RecurringType.YEARLY:
    default:
      realigned = applyStartTime(local, scheduleRule);
      break;
  }

  return realigned.toUTC().toJSDate();
}

export function toPlainScheduleRule(
  rule: RecurringScheduleRule | Record<string, unknown>,
): RecurringScheduleRule {
  if (
    rule &&
    typeof (rule as { toObject?: () => RecurringScheduleRule }).toObject ===
      'function'
  ) {
    return (rule as { toObject: () => RecurringScheduleRule }).toObject();
  }

  return { ...(rule as RecurringScheduleRule) };
}

export function isScheduleRuleCompleteForRecurring(
  recurring: RecurringType,
  scheduleRule: RecurringScheduleRule,
): boolean {
  if (!scheduleRule?.startTime || !scheduleRule?.timezone) {
    return false;
  }

  if (recurring === RecurringType.WEEKLY && scheduleRule.dayOfWeek == null) {
    return false;
  }

  if (recurring === RecurringType.MONTHLY && scheduleRule.dayOfMonth == null) {
    return false;
  }

  return true;
}

export function isOccurrenceAlignedWithScheduleRule(
  startDateTime: Date,
  recurring: RecurringType,
  scheduleRule: RecurringScheduleRule,
  toleranceMs = 60_000,
): boolean {
  if (!isScheduleRuleCompleteForRecurring(recurring, scheduleRule)) {
    return false;
  }

  try {
    const realigned = canonicalOccurrenceStart(
      startDateTime,
      recurring,
      scheduleRule,
    );

    return (
      Math.abs(realigned.getTime() - startDateTime.getTime()) <= toleranceMs
    );
  } catch {
    return false;
  }
}

export function realignOccurrenceToScheduleRule(
  startDateTime: Date,
  recurring: RecurringType,
  scheduleRule: RecurringScheduleRule,
): { startDateTime: Date; endDateTime: Date } {
  const normalizedStart = canonicalOccurrenceStart(
    startDateTime,
    recurring,
    scheduleRule,
  );

  return {
    startDateTime: normalizedStart,
    endDateTime: buildOccurrenceEndDateTime(normalizedStart, scheduleRule),
  };
}

/** True when another canonical slot for the same series falls in the same recurrence period. */
export function hasCanonicalSlotInSamePeriod(
  seriesId: string,
  recurring: RecurringType,
  scheduleRule: RecurringScheduleRule,
  activityStart: Date,
  slotKeys: Iterable<string>,
): boolean {
  const tz = scheduleRule.timezone || UK_TZ;
  const activityLocal = DateTime.fromJSDate(activityStart, {
    zone: 'utc',
  }).setZone(tz);
  const prefix = `${seriesId}:`;

  for (const key of slotKeys) {
    if (!key.startsWith(prefix)) {
      continue;
    }

    const slotStart = DateTime.fromISO(key.slice(prefix.length), {
      zone: 'utc',
    });
    const slotLocal = slotStart.setZone(tz);

    if (recurring === RecurringType.WEEKLY) {
      if (
        activityLocal.weekYear === slotLocal.weekYear &&
        activityLocal.weekNumber === slotLocal.weekNumber
      ) {
        return true;
      }
      continue;
    }

    if (recurring === RecurringType.MONTHLY) {
      if (
        activityLocal.year === slotLocal.year &&
        activityLocal.month === slotLocal.month
      ) {
        return true;
      }
      continue;
    }

    if (recurring === RecurringType.DAILY) {
      if (activityLocal.toISODate() === slotLocal.toISODate()) {
        return true;
      }
      continue;
    }

    if (recurring === RecurringType.YEARLY) {
      if (activityLocal.year === slotLocal.year) {
        return true;
      }
    }
  }

  return false;
}

/** Canonical UTC instant for a series slot (wall time from scheduleRule in series TZ). */
export function normalizeOccurrenceStartDateTime(
  startDateTime: Date,
  scheduleRule: RecurringScheduleRule,
): Date {
  const tz = scheduleRule.timezone || UK_TZ;
  const local = DateTime.fromJSDate(startDateTime, { zone: 'utc' }).setZone(tz);
  const [hourStr, minuteStr] = scheduleRule.startTime.split(':');
  const hour = Number(hourStr);
  const minute = Number(minuteStr);

  const normalized = local.set({
    hour,
    minute,
    second: 0,
    millisecond: 0,
  });

  return normalized.toUTC().toJSDate();
}

export function occurrenceSlotKey(
  seriesId: string,
  startDateTime: Date,
  scheduleRule: RecurringScheduleRule,
  recurring?: RecurringType,
): string {
  const normalized =
    recurring != null
      ? canonicalOccurrenceStart(startDateTime, recurring, scheduleRule)
      : normalizeOccurrenceStartDateTime(startDateTime, scheduleRule);
  return `${seriesId}:${normalized.toISOString()}`;
}

export function normalizeOccurrenceRange(
  startDateTime: Date,
  scheduleRule: RecurringScheduleRule,
  recurring?: RecurringType,
): { startDateTime: Date; endDateTime: Date } {
  const normalizedStart =
    recurring != null
      ? canonicalOccurrenceStart(startDateTime, recurring, scheduleRule)
      : normalizeOccurrenceStartDateTime(startDateTime, scheduleRule);
  return {
    startDateTime: normalizedStart,
    endDateTime: buildOccurrenceEndDateTime(normalizedStart, scheduleRule),
  };
}

function fastForwardCursorToWindow(
  cursor: DateTime,
  windowStart: DateTime,
  recurring: RecurringType,
): DateTime {
  if (cursor >= windowStart) {
    return cursor;
  }

  if (recurring === RecurringType.DAILY) {
    const days = Math.floor(windowStart.diff(cursor, 'days').days);
    if (days > 0) {
      return cursor.plus({ days });
    }
    return cursor;
  }

  if (recurring === RecurringType.WEEKLY) {
    const weeks = Math.floor(windowStart.diff(cursor, 'weeks').weeks);
    if (weeks > 0) {
      return cursor.plus({ weeks });
    }
    return cursor;
  }

  let next = cursor;
  if (recurring === RecurringType.MONTHLY) {
    while (next < windowStart) {
      next = next.plus({ months: 1 });
    }
    return next;
  }

  if (recurring === RecurringType.YEARLY) {
    while (next < windowStart) {
      next = next.plus({ years: 1 });
    }
    return next;
  }

  return cursor;
}

function advanceRecurrenceCursor(
  cursor: DateTime,
  recurring: RecurringType,
): DateTime {
  switch (recurring) {
    case RecurringType.DAILY:
      return cursor.plus({ days: 1 });
    case RecurringType.WEEKLY:
      return cursor.plus({ weeks: 1 });
    case RecurringType.MONTHLY:
      return cursor.plus({ months: 1 });
    case RecurringType.YEARLY:
      return cursor.plus({ years: 1 });
    default:
      throw new Error(`Cannot advance recurrence cursor for ${recurring}`);
  }
}

/**
 * All normalized occurrence starts for a series that overlap a UTC window.
 * Used by host schedule to show the full recurring pattern (not only spawned docs).
 */
export function enumerateOccurrencesInWindow(
  recurring: RecurringType,
  scheduleRule: RecurringScheduleRule,
  seriesAnchorStartDateTime: Date,
  windowStartUtc: Date,
  windowEndUtc: Date,
  maxOccurrences = 400,
): Date[] {
  const windowStart = DateTime.fromJSDate(windowStartUtc, { zone: 'utc' });
  const windowEnd = DateTime.fromJSDate(windowEndUtc, { zone: 'utc' });
  const durationMs = scheduleRule.durationMinutes * 60 * 1000;
  const tz = scheduleRule.timezone || UK_TZ;

  if (recurring === RecurringType.MONTHLY) {
    if (scheduleRule.dayOfMonth == null) {
      throw new Error('dayOfMonth is required for monthly series');
    }

    let cursor = applyMonthlyScheduleSlot(windowStart.setZone(tz), scheduleRule);

    if (cursor < windowStart) {
      cursor = applyMonthlyScheduleSlot(
        cursor.plus({ months: 1 }),
        scheduleRule,
      );
    }

    const results: Date[] = [];
    let safetyLimit = maxOccurrences;

    while (cursor <= windowEnd && safetyLimit-- > 0) {
      const occurrenceEnd = cursor.plus({ milliseconds: durationMs });

      if (cursor <= windowEnd && occurrenceEnd >= windowStart) {
        results.push(cursor.toUTC().toJSDate());
      }

      cursor = applyMonthlyScheduleSlot(cursor.plus({ months: 1 }), scheduleRule);
    }

    return results;
  }

  if (recurring === RecurringType.WEEKLY) {
    if (scheduleRule.dayOfWeek == null) {
      throw new Error('dayOfWeek is required for weekly series');
    }

    let cursor = applyWeeklyScheduleSlot(windowStart.setZone(tz), scheduleRule);

    if (cursor < windowStart) {
      cursor = cursor.plus({ weeks: 1 });
    }

    const results: Date[] = [];
    let safetyLimit = maxOccurrences;

    while (cursor <= windowEnd && safetyLimit-- > 0) {
      const occurrenceEnd = cursor.plus({ milliseconds: durationMs });

      if (cursor <= windowEnd && occurrenceEnd >= windowStart) {
        results.push(cursor.toUTC().toJSDate());
      }

      cursor = cursor.plus({ weeks: 1 });
    }

    return results;
  }

  const normalizedAnchor = canonicalOccurrenceStart(
    seriesAnchorStartDateTime,
    recurring,
    scheduleRule,
  );

  let cursor = DateTime.fromJSDate(normalizedAnchor, { zone: 'utc' });
  cursor = fastForwardCursorToWindow(cursor, windowStart, recurring);

  const results: Date[] = [];
  let safetyLimit = maxOccurrences;

  while (cursor <= windowEnd && safetyLimit-- > 0) {
    const occurrenceEnd = cursor.plus({ milliseconds: durationMs });

    if (cursor <= windowEnd && occurrenceEnd >= windowStart) {
      results.push(cursor.toUTC().toJSDate());
    }

    cursor = advanceRecurrenceCursor(cursor, recurring);
  }

  return results;
}

export type EnsureNextOccurrenceStatus =
  | 'created'
  | 'already_exists'
  | 'not_applicable'
  | 'future_already_scheduled'
  | 'error';

export type EnsureNextOccurrenceResult = {
  status: EnsureNextOccurrenceStatus;
  activityId?: string;
  startDateTime?: Date;
  message?: string;
};
