import { PartialType } from '@nestjs/mapped-types';
import { IsOptional, IsBoolean } from 'class-validator';
import { CreateUserDto } from './create-user.dto';

export class UpdateUserDto extends PartialType(CreateUserDto) {
  // Notification preference fields
  @IsOptional()
  @IsBoolean()
  emailNotifications?: boolean;

  @IsOptional()
  @IsBoolean()
  marketingEmails?: boolean;

  @IsOptional()
  @IsBoolean()
  activityUpdates?: boolean;

  @IsOptional()
  @IsBoolean()
  bookingNotifications?: boolean;

  @IsOptional()
  @IsBoolean()
  paymentNotifications?: boolean;

  // New notification flags
  @IsOptional()
  @IsBoolean()
  hasNewBookings?: boolean;

  @IsOptional()
  @IsBoolean()
  hasNewMessages?: boolean;

  @IsOptional()
  @IsBoolean()
  hasNewPayoutRequests?: boolean;
}
