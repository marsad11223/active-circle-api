import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsString,
  IsArray,
  IsNumber,
  MaxLength,
  MinLength,
  Min,
  Max,
} from 'class-validator';
import { Role, Gender } from 'src/schemas/user.schema';

export class CreateUserDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(16)
  password: string;

  @IsOptional()
  @IsEnum(Role)
  role: Role;

  @IsString()
  address: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  profilePhoto?: string;

  // Member profile specific fields
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  interests?: string[]; // Array of activity interests (only for members)

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50)
  radius?: number; // Search radius in km for activities (1-50km, only for members)

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string; // ISO date string (YYYY-MM-DD)

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;
}
