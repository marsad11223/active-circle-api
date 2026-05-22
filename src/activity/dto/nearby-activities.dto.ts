import { Type } from 'class-transformer';
import {
  IsDateString,
  IsLatitude,
  IsLongitude,
  IsOptional,
  Min,
  Max,
} from 'class-validator';

export class NearbyActivitiesDto {
  @Type(() => Number)
  @IsLatitude()
  lat: number;

  @Type(() => Number)
  @IsLongitude()
  lng: number;

  // Optional: filter by a specific month (1-12). If provided, the service
  // will return activities for that month in the year provided by `date`
  // (if `date` exists) or the current UK year otherwise. You can also
  // provide `year` to select a specific year for the month.
  @Type(() => Number)
  @IsOptional()
  @Min(1)
  @Max(12)
  month?: number;

  // Optional: explicit year to use when `month` is provided. If omitted
  // the service will derive the year from `date` (if present) or the
  // current year in UK time.
  @Type(() => Number)
  @IsOptional()
  @Min(1900)
  @Max(3000)
  year?: number;

  // `date` is optional now — if `month` is not provided, a `date` (ISO)
  // is required to select activities for that specific day.
  @IsOptional()
  @IsDateString()
  date?: string;
}
