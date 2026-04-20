import { IsDateString, IsNotEmpty, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class HostScheduleQueryDto {
  @IsNotEmpty()
  @IsDateString()
  @MaxLength(32)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().slice(0, 32) : value,
  )
  from!: string;

  @IsNotEmpty()
  @IsDateString()
  @MaxLength(32)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().slice(0, 32) : value,
  )
  to!: string;
}
