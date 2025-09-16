import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

enum Role {
  Admin = 'Admin',
  User = 'User',
}

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

  @IsString()
  phoneNumber: string;
}
