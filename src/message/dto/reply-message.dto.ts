import { IsNotEmpty, IsString } from 'class-validator';

export class ReplyMessageDto {
  @IsNotEmpty()
  @IsString()
  messageId: string; // Original message ID to reply to

  @IsNotEmpty()
  @IsString()
  content: string; // Reply content
}

