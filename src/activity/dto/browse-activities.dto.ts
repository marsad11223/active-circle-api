import {
  IsOptional,
  IsString,
  IsNumber,
  IsEnum,
  IsDateString,
  IsArray,
  Min,
  Max,
} from 'class-validator';
import { Transform } from 'class-transformer';

export enum PriceFilter {
  ALL = 'all',
  FREE = 'free',
  PAID = 'paid',
}

export class BrowseActivitiesDto {
  @IsOptional()
  @IsString()
  search?: string; // Search in title and description

  @IsOptional()
  @Transform(({ value }) => {
    // Convert single string to array, or keep array as is
    if (!value) return undefined;
    if (Array.isArray(value)) return value;
    return [value];
  })
  @IsArray()
  @IsString({ each: true })
  category?: string[]; // Activity categories filter (array of strings) - accepts single value or array

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  maxDistance?: number; // Max distance in km (uses member's radius if not provided)

  @IsOptional()
  @IsDateString()
  date?: string; // Filter by specific date (ISO date string)

  @IsOptional()
  @IsEnum(PriceFilter)
  price?: PriceFilter; // all, free, or paid

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(5)
  minHostRating?: number; // Minimum host rating (0-5)
}
