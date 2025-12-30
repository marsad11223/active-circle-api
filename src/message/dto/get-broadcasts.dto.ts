import { IsOptional, IsString } from 'class-validator';

export class GetBroadcastsDto {
  @IsOptional()
  @IsString()
  activityId?: string; // Optional activity ID filter
}

