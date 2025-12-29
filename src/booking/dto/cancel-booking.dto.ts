import { IsOptional, IsString } from 'class-validator';

export class CancelBookingDto {
  @IsOptional()
  @IsString()
  cancelReason?: string; // Optional reason for cancellation
}

