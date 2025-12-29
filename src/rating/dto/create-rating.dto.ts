import {
  IsNotEmpty,
  IsString,
  IsNumber,
  Min,
  Max,
  IsOptional,
} from 'class-validator';

export class CreateRatingDto {
  @IsNotEmpty()
  @IsString()
  bookingId: string; // Booking ID for which rating is being given

  @IsNotEmpty()
  @IsNumber()
  @Min(1, { message: 'Rating must be at least 1' })
  @Max(5, { message: 'Rating must be at most 5' })
  rating: number; // Rating from 1 to 5 stars

  @IsOptional()
  @IsString()
  review?: string; // Optional review text
}
