import {
  IsNotEmpty,
  IsString,
  IsNumber,
  IsOptional,
  IsEnum,
  IsArray,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { RecurringType } from 'src/schemas/activity.schema';
import { Type } from 'class-transformer';

class ActivityCoordinatesDto {
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  lat!: number;

  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  lng!: number;
}

export class CreateActivityDto {
  @IsNotEmpty()
  @IsString()
  title!: string;

  @IsNotEmpty()
  @IsString()
  description!: string;

  @IsNotEmpty()
  @IsArray()
  @IsString({ each: true })
  category!: string[]; // Array of categories

  @IsNotEmpty()
  @IsString()
  location!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ActivityCoordinatesDto)
  coordinates?: ActivityCoordinatesDto;

  @IsOptional()
  @IsString()
  difficultyLevel?: string;

  @IsNotEmpty()
  @IsString()
  startDateTime!: string; // UTC ISO datetime, e.g. 2026-08-15T18:10:00.000Z

  @IsNotEmpty()
  @IsString()
  endDateTime!: string; // UTC ISO datetime

  @IsOptional()
  @IsString()
  /** IANA zone used to derive recurring scheduleRule from the first occurrence (e.g. Asia/Karachi). Send the user's local timezone. */
  timezone?: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  @Max(1000)
  maxParticipants!: number;

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

  @IsOptional()
  @IsString()
  picture?: string; // Primary image URL (backward compatible)

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  pictures?: string[]; // Multiple image URLs
}
