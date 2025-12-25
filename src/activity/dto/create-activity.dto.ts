import {
  IsNotEmpty,
  IsString,
  IsNumber,
  IsOptional,
  IsEnum,
  IsDateString,
  Min,
  Max,
} from 'class-validator';
import { RecurringType } from 'src/schemas/activity.schema';

export class CreateActivityDto {
  @IsNotEmpty()
  @IsString()
  title: string;

  @IsNotEmpty()
  @IsString()
  description: string;

  @IsNotEmpty()
  @IsString()
  category: string;

  @IsNotEmpty()
  @IsString()
  location: string;

  @IsNotEmpty()
  @IsDateString()
  date: string; // ISO date string

  @IsNotEmpty()
  @IsString()
  time: string; // Time string (e.g., "14:00" or "2:00 PM")

  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  @Max(1000)
  maxParticipants: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number; // Optional, 0 or empty means free

  @IsOptional()
  @IsEnum(RecurringType)
  recurring?: RecurringType;

  @IsOptional()
  @IsString()
  additionalInformation?: string;

  @IsNotEmpty()
  @IsString()
  picture: string; // Picture URL
}

