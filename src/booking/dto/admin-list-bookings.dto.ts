import { IsOptional, IsString, IsInt, Min, IsEnum, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { BookingStatus, PaymentStatus, AttendanceStatus } from 'src/schemas/booking.schema';

export enum BookingSortBy {
  CREATED_AT = 'created_at',
  AMOUNT = 'amount',
  ACTIVITY_DATE = 'activityDate',
}

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export class AdminListBookingsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @IsOptional()
  @IsString()
  search?: string; // Search by member name, activity title, or host name

  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus; // Filter by booking status: pending, confirmed, cancelled

  @IsOptional()
  @IsEnum(PaymentStatus)
  paymentStatus?: PaymentStatus; // Filter by payment status: pending, paid, refunded, transferred

  @IsOptional()
  @IsEnum(AttendanceStatus)
  attendanceStatus?: AttendanceStatus; // Filter by attendance status: pending, present, absent

  @IsOptional()
  @IsDateString()
  startDate?: string; // Filter bookings by activity date (from date)

  @IsOptional()
  @IsDateString()
  endDate?: string; // Filter bookings by activity date (to date)

  @IsOptional()
  @IsEnum(BookingSortBy)
  sortBy?: BookingSortBy = BookingSortBy.CREATED_AT;

  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder = SortOrder.DESC; // Latest to Oldest by default
}

