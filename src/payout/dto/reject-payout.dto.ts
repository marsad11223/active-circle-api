import { IsNotEmpty, IsString } from 'class-validator';

export class RejectPayoutDto {
  @IsNotEmpty()
  @IsString()
  reason: string; // Required reason for rejection
}

