import { IsNotEmpty, IsEnum, IsString } from 'class-validator';
import { AttendanceStatus } from 'src/schemas/booking.schema';

export class MarkAttendanceDto {
  @IsNotEmpty()
  @IsString()
  bookingId: string; // Booking ID to mark attendance for

  @IsNotEmpty()
  @IsEnum(AttendanceStatus)
  attendanceStatus: AttendanceStatus; // present or absent
}

