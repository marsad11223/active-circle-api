import { IsOptional, IsString } from 'class-validator';

export class HostReviewsDto {
  @IsOptional()
  @IsString()
  activityId?: string; // Optional activity ID filter
}

