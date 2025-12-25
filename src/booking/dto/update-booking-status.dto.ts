import { IsEnum, IsOptional, IsString } from 'class-validator';
import { BookingStatus } from 'src/schemas/booking.schema';

export class UpdateBookingStatusDto {
  @IsOptional()
  @IsString()
  declineReason?: string; // Reason for declining (optional)
}

