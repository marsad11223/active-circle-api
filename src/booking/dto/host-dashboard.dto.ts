import { IsOptional, IsString, IsIn } from 'class-validator';
import { BookingStatus } from 'src/schemas/booking.schema';

export class HostDashboardDto {
  @IsOptional()
  @IsIn([BookingStatus.PENDING, BookingStatus.CONFIRMED, BookingStatus.CANCELLED, 'all'])
  status?: BookingStatus | 'all'; // 'all' for all statuses

  @IsOptional()
  @IsString()
  activityId?: string; // Optional activity ID filter
}

