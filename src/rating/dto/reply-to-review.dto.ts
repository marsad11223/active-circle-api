import { IsNotEmpty, IsString } from 'class-validator';

export class ReplyToReviewDto {
  @IsNotEmpty()
  @IsString()
  ratingId: string; // Rating ID to reply to

  @IsNotEmpty()
  @IsString()
  reply: string; // Host's reply text
}

