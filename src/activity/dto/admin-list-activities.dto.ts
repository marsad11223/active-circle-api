import { IsOptional, IsString, IsInt, Min, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

export enum ActivitySortBy {
  DATE = 'date',
  TITLE = 'title',
  PRICE = 'price',
  MAX_PARTICIPANTS = 'maxParticipants',
  CREATED_AT = 'created_at',
}

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export enum ActivityTimeFilter {
  ALL = 'all',
  UPCOMING = 'upcoming',
  PAST = 'past',
}

export enum ActivityStatusFilter {
  ALL = 'all',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export class AdminListActivitiesDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @IsOptional()
  @IsString()
  search?: string; // Search by title and host name

  @IsOptional()
  @IsString()
  hostId?: string; // Optional filter to return activities for a specific host

  @IsOptional()
  @IsEnum(ActivityTimeFilter)
  timeFilter?: ActivityTimeFilter = ActivityTimeFilter.ALL; // upcoming, past, or all

  @IsOptional()
  @IsEnum(ActivityStatusFilter)
  status?: ActivityStatusFilter = ActivityStatusFilter.ALL; // active, completed, cancelled, or all

  @IsOptional()
  @IsEnum(ActivitySortBy)
  sortBy?: ActivitySortBy = ActivitySortBy.DATE;

  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder = SortOrder.DESC; // Latest to Oldest by default
}
