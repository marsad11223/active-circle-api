import {
  IsNotEmpty,
  IsString,
  IsEnum,
  IsOptional,
} from 'class-validator';
import { BroadcastType } from 'src/schemas/message.schema';

export class BroadcastMessageDto {
  @IsNotEmpty()
  @IsString()
  activityId: string; // Activity to broadcast to

  @IsNotEmpty()
  @IsEnum(BroadcastType)
  broadcastType: BroadcastType; // Type of broadcast

  @IsNotEmpty()
  @IsString()
  subject: string; // Broadcast subject

  @IsNotEmpty()
  @IsString()
  content: string; // Broadcast message content
}

