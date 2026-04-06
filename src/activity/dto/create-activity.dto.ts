import {
  IsNotEmpty,
  IsString,
  IsNumber,
  IsOptional,
  IsEnum,
  IsDateString,
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
  @IsDateString()
  date!: string; // ISO date string

  @IsNotEmpty()
  @IsString()
  time!: string; // Time string (e.g., "14:00" or "2:00 PM")

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

  @IsNotEmpty()
  @IsString()
  picture!: string; // Picture URL
}
