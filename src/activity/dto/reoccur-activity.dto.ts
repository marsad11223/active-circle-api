import { IsNotEmpty, IsString, IsDateString } from 'class-validator';

export class ReoccurActivityDto {
  @IsNotEmpty()
  @IsDateString()
  date: string; // New date for the activity

  @IsNotEmpty()
  @IsString()
  time: string; // New time for the activity (e.g., "14:00" or "2:00 PM")
}

