import { BadRequestException } from '@nestjs/common';
import {
  bookingCapacityInfo,
  isUnlimitedCapacity,
  remainingSeatsForCapacity,
  resolveMaxParticipants,
} from './activity-capacity';

describe('activity-capacity', () => {
  describe('isUnlimitedCapacity', () => {
    it('treats null and undefined as unlimited', () => {
      expect(isUnlimitedCapacity(null)).toBe(true);
      expect(isUnlimitedCapacity(undefined)).toBe(true);
    });

    it('treats a positive number as limited', () => {
      expect(isUnlimitedCapacity(1)).toBe(false);
      expect(isUnlimitedCapacity(20)).toBe(false);
    });
  });

  describe('remainingSeatsForCapacity', () => {
    it('returns null when unlimited', () => {
      expect(remainingSeatsForCapacity(null, 50)).toBeNull();
    });

    it('never goes below zero', () => {
      expect(remainingSeatsForCapacity(10, 12)).toBe(0);
      expect(remainingSeatsForCapacity(10, 3)).toBe(7);
    });
  });

  describe('bookingCapacityInfo', () => {
    it('flags unlimited activities', () => {
      expect(bookingCapacityInfo(null, 4)).toEqual({
        bookedCount: 4,
        remainingSeats: null,
        maxParticipants: null,
        unlimitedParticipants: true,
      });
    });

    it('computes remaining seats for limited activities', () => {
      expect(bookingCapacityInfo(10, 4)).toEqual({
        bookedCount: 4,
        remainingSeats: 6,
        maxParticipants: 10,
        unlimitedParticipants: false,
      });
    });
  });

  describe('resolveMaxParticipants', () => {
    it('creates unlimited from the boolean flag', () => {
      expect(
        resolveMaxParticipants({ unlimitedParticipants: true }, 'create'),
      ).toBeNull();
    });

    it('creates unlimited from a null maxParticipants', () => {
      expect(
        resolveMaxParticipants({ maxParticipants: null }, 'create'),
      ).toBeNull();
    });

    it('creates a numeric limit', () => {
      expect(resolveMaxParticipants({ maxParticipants: 15 }, 'create')).toBe(
        15,
      );
    });

    it('requires a number when unlimitedParticipants is false', () => {
      expect(() =>
        resolveMaxParticipants({ unlimitedParticipants: false }, 'create'),
      ).toThrow(BadRequestException);
    });

    it('leaves the existing value unchanged on update when omitted', () => {
      expect(resolveMaxParticipants({}, 'update')).toBeUndefined();
    });
  });
});
