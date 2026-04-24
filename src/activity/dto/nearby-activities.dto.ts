import { Type } from 'class-transformer';
import { IsDateString, IsLatitude, IsLongitude } from 'class-validator';

export class NearbyActivitiesDto {
  @Type(() => Number)
  @IsLatitude()
  lat: number;

  @Type(() => Number)
  @IsLongitude()
  lng: number;

  @IsDateString()
  date: string;
}
