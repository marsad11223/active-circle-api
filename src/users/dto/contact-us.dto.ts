import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class ContactUsDto {
  @IsNotEmpty()
  @IsString()
  subject: string;

  @IsString()
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  body: string;
}
