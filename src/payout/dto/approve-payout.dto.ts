import { IsOptional, IsString } from 'class-validator';

export class ApprovePayoutDto {
  @IsOptional()
  @IsString()
  rejectionReason?: string; // Required if rejecting
}

