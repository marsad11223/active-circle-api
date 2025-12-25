import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class CreateBookingDto {
  @IsNotEmpty()
  @IsString()
  activityId: string; // Activity to book

  @IsOptional()
  @IsString()
  paymentMethodId?: string; // Stripe payment method ID (for paid activities)
}

