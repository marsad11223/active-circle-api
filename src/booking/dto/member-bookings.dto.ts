import { IsOptional, IsIn } from 'class-validator';

export class MemberBookingsDto {
  @IsOptional()
  @IsIn(['upcoming', 'pending', 'past', 'cancelled', 'all'])
  filter?: 'upcoming' | 'pending' | 'past' | 'cancelled' | 'all'; // Filter bookings by status/type
}

