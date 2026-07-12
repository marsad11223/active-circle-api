import { IsNotEmpty, IsString } from 'class-validator';

export class ReoccurActivityDto {
  @IsNotEmpty()
  @IsString()
  startDateTime: string; // New start datetime for the activity (UK-local ISO, 24-hour format)

  @IsNotEmpty()
  @IsString()
  endDateTime: string; // New end datetime for the activity (UK-local ISO, 24-hour format)
}
