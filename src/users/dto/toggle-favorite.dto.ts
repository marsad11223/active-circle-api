import { IsNotEmpty, IsString } from 'class-validator';

export class ToggleFavoriteDto {
  @IsNotEmpty()
  @IsString()
  activityId: string; // Activity ID to add/remove from favorites
}

