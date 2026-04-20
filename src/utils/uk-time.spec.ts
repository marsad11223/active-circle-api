import { DateTime } from 'luxon';
import {
  UK_TZ,
  activityStartDateTimeLondon,
  eachLondonDayInclusive,
  parseActivityTimeString,
} from './uk-time';

describe('parseActivityTimeString', () => {
  it('parses 24h HH:mm', () => {
    expect(parseActivityTimeString('14:00')).toEqual({ hour: 14, minute: 0 });
    expect(parseActivityTimeString('09:30')).toEqual({ hour: 9, minute: 30 });
  });

  it('parses 12h with AM/PM', () => {
    expect(parseActivityTimeString('2:00 PM')).toEqual({ hour: 14, minute: 0 });
    expect(parseActivityTimeString('12:00 AM')).toEqual({ hour: 0, minute: 0 });
    expect(parseActivityTimeString('12:00 PM')).toEqual({
      hour: 12,
      minute: 0,
    });
    expect(parseActivityTimeString('11:59pm')).toEqual({
      hour: 23,
      minute: 59,
    });
  });

  it('returns null for invalid input', () => {
    expect(parseActivityTimeString('')).toBeNull();
    expect(parseActivityTimeString('25:00')).toBeNull();
    expect(parseActivityTimeString('garbage')).toBeNull();
  });
});

describe('activityStartDateTimeLondon', () => {
  it('combines UTC date with wall time in London', () => {
    const d = new Date('2025-06-15T00:00:00.000Z');
    const start = activityStartDateTimeLondon(d, '14:30');
    expect(start).not.toBeNull();
    expect(start!.zoneName).toBe(UK_TZ);
    expect(start!.hour).toBe(14);
    expect(start!.minute).toBe(30);
    expect(start!.toFormat('yyyy-MM-dd')).toBe('2025-06-15');
  });

  /** UK spring forward 2025-03-30: BST begins; local offset +01:00 after transition. */
  it('uses Europe/London offset on BST start date', () => {
    const d = new Date('2025-03-30T12:00:00.000Z');
    const start = activityStartDateTimeLondon(d, '14:00');
    expect(start).not.toBeNull();
    expect(start!.offset).toBe(60); // minutes east of UTC = BST
    expect(start!.toFormat('ZZ')).toMatch(/^\+/);
  });
});

describe('eachLondonDayInclusive', () => {
  it('iterates inclusive days', () => {
    const days = [...eachLondonDayInclusive('2025-04-10', '2025-04-12')];
    expect(days).toHaveLength(3);
    expect(days.map((x) => x.toFormat('yyyy-MM-dd'))).toEqual([
      '2025-04-10',
      '2025-04-11',
      '2025-04-12',
    ]);
  });
});

describe('DateTime sanity', () => {
  it('London winter offset is 0', () => {
    const winter = DateTime.fromObject(
      { year: 2025, month: 1, day: 15, hour: 12 },
      { zone: UK_TZ },
    );
    expect(winter.offset).toBe(0);
  });
});
