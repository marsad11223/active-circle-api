import { IsNotEmpty, IsNumber, Min, Max } from 'class-validator';

export class CreateWithdrawalRequestDto {
  @IsNotEmpty()
  @IsNumber()
  @Min(0.01, { message: 'Amount must be at least 0.01' })
  amount: number; // Amount to withdraw
}

