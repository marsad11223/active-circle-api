import {
  IsOptional,
  IsString,
  IsNumber,
  IsEnum,
  IsDateString,
  IsArray,
  Min,
  Max,
  IsInt,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export enum PriceFilter {
  ALL = 'all',
  FREE = 'free',
  PAID = 'paid',
}

export class BrowseActivitiesDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

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
  @Type(() => Number)
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
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(5)
  minHostRating?: number; // Minimum host rating (0-5)
}
