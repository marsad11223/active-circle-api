import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class SendMessageDto {
  @IsNotEmpty()
  @IsString()
  activityId: string; // Activity the member is inquiring about

  @IsNotEmpty()
  @IsString()
  subject: string; // Message subject

  @IsNotEmpty()
  @IsString()
  content: string; // Message content
}

