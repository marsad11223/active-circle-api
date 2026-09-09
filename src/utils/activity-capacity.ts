import { BadRequestException } from '@nestjs/common';

export type ParticipantLimitInput = {
  maxParticipants?: number | null;
  unlimitedParticipants?: boolean;
};

export function isUnlimitedCapacity(
  maxParticipants: number | null | undefined,
): maxParticipants is null | undefined {
  return maxParticipants == null;
}

export function remainingSeatsForCapacity(
  maxParticipants: number | null | undefined,
  bookedCount: number,
): number | null {
  if (isUnlimitedCapacity(maxParticipants)) {
    return null;
  }
  return Math.max(0, maxParticipants - bookedCount);
}

export function bookingCapacityInfo(
  maxParticipants: number | null | undefined,
  bookedCount: number,
): {
  bookedCount: number;
  remainingSeats: number | null;
  maxParticipants: number | null;
  unlimitedParticipants: boolean;
} {
  const unlimited = isUnlimitedCapacity(maxParticipants);
  return {
    bookedCount,
    remainingSeats: remainingSeatsForCapacity(maxParticipants, bookedCount),
    maxParticipants: unlimited ? null : maxParticipants,
    unlimitedParticipants: unlimited,
  };
}

/**
 * Create: must resolve to a number or null (unlimited).
 * Update: returns undefined when neither field is present so the existing value is kept.
 */
export function resolveMaxParticipants(
  input: ParticipantLimitInput,
  mode: 'create' | 'update',
): number | null | undefined {
  const { maxParticipants, unlimitedParticipants } = input;

  if (unlimitedParticipants === true) {
    return null;
  }

  if (unlimitedParticipants === false) {
    if (typeof maxParticipants === 'number') {
      return maxParticipants;
    }
    throw new BadRequestException(
      'maxParticipants is required when unlimitedParticipants is false',
    );
  }

  if (maxParticipants === null) {
    return null;
  }

  if (typeof maxParticipants === 'number') {
    return maxParticipants;
  }

  if (mode === 'create') {
    throw new BadRequestException(
      'Provide maxParticipants or set unlimitedParticipants to true',
    );
  }

  return undefined;
}
