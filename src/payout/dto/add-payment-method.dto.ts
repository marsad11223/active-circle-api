import { IsNotEmpty, IsString } from 'class-validator';

export class AddPaymentMethodDto {
  @IsNotEmpty()
  @IsString()
  paymentMethodId: string; // Stripe payment method ID
}

