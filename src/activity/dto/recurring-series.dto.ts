import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { RecurringType } from 'src/schemas/activity.schema';

export class ScheduleRuleDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(7)
  dayOfWeek?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  dayOfMonth?: number;

  @IsOptional()
  @IsString()
  startTime?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationMinutes?: number;

  @IsOptional()
  @IsString()
  timezone?: string;
}

export class UpdateRecurringSeriesDto {
  @IsOptional()
  @IsEnum(RecurringType)
  recurring?: RecurringType;

  @IsOptional()
  @ValidateNested()
  @Type(() => ScheduleRuleDto)
  scheduleRule?: ScheduleRuleDto;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  category?: string[];

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  coordinates?: { lat: number; lng: number };

  @IsOptional()
  @IsString()
  difficultyLevel?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxParticipants?: number;

  @IsOptional()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsString()
  additionalInformation?: string;

  @IsOptional()
  @IsString()
  picture?: string;

  @IsOptional()
  pictures?: string[];
}

export class StopRecurringSeriesDto {
  @IsOptional()
  @IsBoolean()
  cancelFutureOccurrences?: boolean;
}

export class ResumeRecurringSeriesDto {
  /** When true (default), spawn the next occurrence if none is scheduled. */
  @IsOptional()
  @IsBoolean()
  spawnNextOccurrence?: boolean;
}
