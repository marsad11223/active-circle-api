import { IsOptional, IsString, IsInt, Min, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

export enum UserSortBy {
  NAME = 'name',
  EMAIL = 'email',
  CREATED_AT = 'created_at',
  LAST_LOGIN = 'lastLogin',
}

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export enum HasSubscription {
  TRUE = 'true',
  FALSE = 'false',
  ALL = 'all',
}

export class AdminListUsersDto {
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
  search?: string; // Search in name, email

  @IsOptional()
  @IsEnum(UserSortBy)
  sortBy?: UserSortBy = UserSortBy.CREATED_AT;

  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder = SortOrder.DESC;

  @IsOptional()
  @IsEnum(HasSubscription)
  hasSubscription?: HasSubscription = HasSubscription.ALL; // Filter by subscription status: true, false, or all
}

