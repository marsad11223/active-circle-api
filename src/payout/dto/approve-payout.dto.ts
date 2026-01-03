import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ApprovePayoutDto {
  @IsNotEmpty()
  @IsString()
  screenshot: string; // Screenshot URL (required for approval)

  @IsOptional()
  @IsString()
  reason?: string; // Optional reason for approval
}
