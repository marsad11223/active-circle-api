import { DateTime } from 'luxon';
import { RecurringType } from 'src/schemas/activity.schema';
import { MONTHLY_DAY_CLAMP_POLICY } from './recurring-activity';
import {
  buildOccurrenceEndDateTime,
  assertValidScheduleRuleForRecurring,
  applyMonthlyScheduleSlot,
  computeNextOccurrenceStart,
  deriveScheduleRuleFromOccurrence,
  enumerateOccurrencesInWindow,
  fastForwardToFuture,
  getSeriesScheduleFloorUtc,
  normalizeScheduleRuleForRecurring,
  scheduleRuleMongoUpdates,
  normalizeOccurrenceStartDateTime,
} from './recurring-activity';
import { UK_TZ } from './uk-time';

describe('recurring-activity schedule utilities', () => {
  const weeklyRule = {
    dayOfWeek: 2,
    startTime: '10:00',
    durationMinutes: 90,
    timezone: UK_TZ,
  };

  const monthlyRule31 = {
    dayOfMonth: 31,
    startTime: '09:00',
    durationMinutes: 60,
    timezone: UK_TZ,
  };

  it('derives weekly schedule rule from an occurrence', () => {
    const start = DateTime.fromISO('2026-01-06T10:00:00', { zone: UK_TZ })
      .toUTC()
      .toJSDate();
    const end = DateTime.fromISO('2026-01-06T11:30:00', { zone: UK_TZ })
      .toUTC()
      .toJSDate();

    const rule = deriveScheduleRuleFromOccurrence(
      start,
      end,
      RecurringType.WEEKLY,
      UK_TZ,
    );

    expect(rule.dayOfWeek).toBe(2); // Tuesday
    expect(rule.startTime).toBe('10:00');
    expect(rule.durationMinutes).toBe(90);
  });

  it('computes next weekly slot from schedule rule anchored on last occurrence', () => {
    const lastStart = DateTime.fromISO('2026-01-06T10:00:00', { zone: UK_TZ })
      .toUTC()
      .toJSDate();

    const next = computeNextOccurrenceStart(
      RecurringType.WEEKLY,
      weeklyRule,
      lastStart,
    );

    const nextLondon = DateTime.fromJSDate(next, { zone: 'utc' }).setZone(
      UK_TZ,
    );
    expect(nextLondon.toISODate()).toBe('2026-01-13');
    expect(nextLondon.hour).toBe(10);
    expect(nextLondon.weekday).toBe(2);
  });

  it('computes next slot independently of which occurrence completed', () => {
    const anchor = DateTime.fromISO('2026-03-03T10:00:00', { zone: UK_TZ })
      .toUTC()
      .toJSDate();

    const fromFirst = computeNextOccurrenceStart(
      RecurringType.WEEKLY,
      weeklyRule,
      anchor,
    );
    const fromFifth = computeNextOccurrenceStart(
      RecurringType.WEEKLY,
      weeklyRule,
      anchor,
    );

    expect(fromFirst.getTime()).toBe(fromFifth.getTime());
  });

  it(`follows ${MONTHLY_DAY_CLAMP_POLICY} for Jan 31 → February`, () => {
    const jan31 = DateTime.fromISO('2026-01-31T09:00:00', { zone: UK_TZ })
      .toUTC()
      .toJSDate();

    const next = computeNextOccurrenceStart(
      RecurringType.MONTHLY,
      monthlyRule31,
      jan31,
    );

    const nextLondon = DateTime.fromJSDate(next, { zone: 'utc' }).setZone(
      UK_TZ,
    );
    expect(nextLondon.toISODate()).toBe('2026-02-28');
    expect(nextLondon.day).toBe(28);
  });

  it('fast-forwards when cron is delayed', () => {
    const lastStart = DateTime.fromISO('2026-01-06T10:00:00', { zone: UK_TZ })
      .toUTC()
      .toJSDate();
    const nowUtc = DateTime.fromISO('2026-02-10T12:00:00', { zone: UK_TZ })
      .toUTC()
      .toJSDate();

    const next = fastForwardToFuture(
      RecurringType.WEEKLY,
      weeklyRule,
      lastStart,
      nowUtc,
    );

    const nextLondon = DateTime.fromJSDate(next, { zone: 'utc' }).setZone(
      UK_TZ,
    );
    expect(nextLondon >= DateTime.fromJSDate(nowUtc, { zone: 'utc' })).toBe(
      true,
    );
    expect(nextLondon.weekday).toBe(2);
  });

  it('builds end datetime from duration in schedule rule', () => {
    const start = DateTime.fromISO('2026-06-01T14:00:00', { zone: UK_TZ })
      .toUTC()
      .toJSDate();
    const end = buildOccurrenceEndDateTime(start, {
      startTime: '14:00',
      durationMinutes: 45,
      timezone: UK_TZ,
    });

    const endLondon = DateTime.fromJSDate(end, { zone: 'utc' }).setZone(
      UK_TZ,
    );
    expect(endLondon.hour).toBe(14);
    expect(endLondon.minute).toBe(45);
  });

  it('normalizes occurrence start to schedule wall time', () => {
    const start = DateTime.fromISO('2026-09-30T10:00:05', { zone: UK_TZ })
      .toUTC()
      .toJSDate();
    const rule = {
      startTime: '10:00',
      durationMinutes: 60,
      timezone: UK_TZ,
    };

    const normalized = normalizeOccurrenceStartDateTime(start, rule);
    const again = normalizeOccurrenceStartDateTime(normalized, rule);

    expect(again.getTime()).toBe(normalized.getTime());
    expect(
      DateTime.fromJSDate(normalized, { zone: 'utc' }).setZone(UK_TZ).second,
    ).toBe(0);
  });

  it('picks up updated schedule rule on next computation', () => {
    const lastStart = DateTime.fromISO('2026-01-06T10:00:00', { zone: UK_TZ })
      .toUTC()
      .toJSDate();

    const originalNext = computeNextOccurrenceStart(
      RecurringType.WEEKLY,
      weeklyRule,
      lastStart,
    );

    const mondayRule = { ...weeklyRule, dayOfWeek: 1, startTime: '08:30' };
    const updatedNext = computeNextOccurrenceStart(
      RecurringType.WEEKLY,
      mondayRule,
      lastStart,
    );

    expect(updatedNext.getTime()).not.toBe(originalNext.getTime());
    const updatedLondon = DateTime.fromJSDate(updatedNext, {
      zone: 'utc',
    }).setZone(UK_TZ);
    expect(updatedLondon.weekday).toBe(1);
    expect(updatedLondon.hour).toBe(8);
    expect(updatedLondon.minute).toBe(30);
  });

  it('enumerates weekly occurrences across a UTC window', () => {
    const anchor = DateTime.fromISO('2026-09-22T21:15:00', { zone: 'utc' }).toJSDate();
    const windowStart = DateTime.fromISO('2026-08-01T00:00:00', {
      zone: 'utc',
    }).toJSDate();
    const windowEnd = DateTime.fromISO('2026-10-31T23:59:59', {
      zone: 'utc',
    }).toJSDate();

    const occurrences = enumerateOccurrencesInWindow(
      RecurringType.WEEKLY,
      {
        dayOfWeek: 2,
        startTime: '22:15',
        durationMinutes: 60,
        timezone: UK_TZ,
      },
      anchor,
      windowStart,
      windowEnd,
    );

    expect(occurrences.length).toBeGreaterThanOrEqual(6);
    for (const occurrence of occurrences) {
      const local = DateTime.fromJSDate(occurrence, { zone: 'utc' }).setZone(
        UK_TZ,
      );
      expect(local.weekday).toBe(2);
      expect(local.hour).toBe(22);
      expect(local.minute).toBe(15);
    }

    const londonDates = occurrences.map((date) =>
      DateTime.fromJSDate(date, { zone: 'utc' }).setZone(UK_TZ).toISODate(),
    );
    expect(londonDates).toContain('2026-09-22');
    expect(londonDates).toContain('2026-10-27');
  });

  it('normalizes schedule rule fields when recurring type changes', () => {
    const anchor = DateTime.fromISO('2026-08-31T23:10:00', {
      zone: UK_TZ,
    })
      .toUTC()
      .toJSDate();

    const monthlyRule = normalizeScheduleRuleForRecurring(
      RecurringType.MONTHLY,
      {
        startTime: '23:10',
        durationMinutes: 15,
        timezone: UK_TZ,
        dayOfWeek: 7,
      },
      anchor,
    );

    expect(monthlyRule.dayOfMonth).toBe(31);
    expect(monthlyRule.dayOfWeek).toBeUndefined();

    const weeklyRule = normalizeScheduleRuleForRecurring(
      RecurringType.WEEKLY,
      {
        startTime: '23:10',
        durationMinutes: 15,
        timezone: UK_TZ,
        dayOfMonth: 31,
      },
      anchor,
    );

    expect(weeklyRule.dayOfWeek).toBe(1);
    expect(weeklyRule.dayOfMonth).toBeUndefined();
  });

  it('persists monthly schedule rule fields and unsets weekly fields', () => {
    const { set, unset } = scheduleRuleMongoUpdates(RecurringType.MONTHLY, {
      startTime: '19:10',
      durationMinutes: 5,
      timezone: UK_TZ,
      dayOfMonth: 12,
    });

    expect(set['scheduleRule.dayOfMonth']).toBe(12);
    expect(set['scheduleRule.dayOfWeek']).toBeUndefined();
    expect(unset['scheduleRule.dayOfWeek']).toBe('');
    expect(unset['scheduleRule.dayOfMonth']).toBeUndefined();
  });

  it('enumerates monthly occurrences on dayOfMonth not legacy anchor day', () => {
    const anchor = DateTime.fromISO('2026-08-23T18:10:00', { zone: 'utc' }).toJSDate();
    const windowStart = DateTime.fromISO('2026-08-01T00:00:00', {
      zone: 'utc',
    }).toJSDate();
    const windowEnd = DateTime.fromISO('2026-12-31T23:59:59', {
      zone: 'utc',
    }).toJSDate();

    const occurrences = enumerateOccurrencesInWindow(
      RecurringType.MONTHLY,
      {
        startTime: '19:10',
        durationMinutes: 5,
        timezone: UK_TZ,
        dayOfMonth: 12,
      },
      anchor,
      windowStart,
      windowEnd,
    );

    const londonDates = occurrences.map((date) =>
      DateTime.fromJSDate(date, { zone: 'utc' }).setZone(UK_TZ).toISODate(),
    );

    expect(londonDates).toEqual([
      '2026-08-12',
      '2026-09-12',
      '2026-10-12',
      '2026-11-12',
      '2026-12-12',
    ]);
  });

  it('computes next monthly occurrence on configured dayOfMonth', () => {
    const anchor = DateTime.fromISO('2026-08-23T18:10:00', { zone: 'utc' }).toJSDate();
    const next = computeNextOccurrenceStart(
      RecurringType.MONTHLY,
      {
        startTime: '19:10',
        durationMinutes: 5,
        timezone: UK_TZ,
        dayOfMonth: 12,
      },
      anchor,
    );

    const nextLondon = DateTime.fromJSDate(next, { zone: 'utc' }).setZone(UK_TZ);
    expect(nextLondon.toISODate()).toBe('2026-09-12');
    expect(nextLondon.hour).toBe(19);
    expect(nextLondon.minute).toBe(10);
  });

  it('enumerates weekly occurrences on dayOfWeek from rule, not legacy anchor weekday', () => {
    const fridayRule = {
      dayOfWeek: 5,
      startTime: '17:48',
      durationMinutes: 66,
      timezone: UK_TZ,
    };
    const saturdayAnchor = DateTime.fromISO('2026-08-30T16:48:00', {
      zone: 'utc',
    }).toJSDate();
    const windowStart = DateTime.fromISO('2026-09-01T00:00:00', {
      zone: 'utc',
    }).toJSDate();
    const windowEnd = DateTime.fromISO('2026-09-30T23:59:59', {
      zone: 'utc',
    }).toJSDate();

    const occurrences = enumerateOccurrencesInWindow(
      RecurringType.WEEKLY,
      fridayRule,
      saturdayAnchor,
      windowStart,
      windowEnd,
    );

    const londonMeta = occurrences.map((date) => {
      const local = DateTime.fromJSDate(date, { zone: 'utc' }).setZone(UK_TZ);
      return { date: local.toISODate(), weekday: local.weekday };
    });

    expect(londonMeta.every((entry) => entry.weekday === 5)).toBe(true);
    expect(londonMeta.map((entry) => entry.date)).toEqual([
      '2026-09-04',
      '2026-09-11',
      '2026-09-18',
      '2026-09-25',
    ]);
  });

  it('schedule floor follows next spawned session, not earlier virtual slots', () => {
    const saturdayUpcoming = DateTime.fromISO('2026-09-13T11:15:00', {
      zone: 'utc',
    }).toJSDate();
    const mondayRule = {
      dayOfWeek: 1,
      startTime: '16:15',
      durationMinutes: 60,
      timezone: UK_TZ,
    };
    const anchor = DateTime.fromISO('2026-09-06T11:15:00', {
      zone: 'utc',
    }).toJSDate();

    const floor = getSeriesScheduleFloorUtc(
      RecurringType.WEEKLY,
      mondayRule,
      anchor,
      DateTime.fromISO('2026-09-01T00:00:00', { zone: 'utc' }).toJSDate(),
      saturdayUpcoming,
    );

    expect(floor.toISOString()).toBe(saturdayUpcoming.toISOString());
  });
});
