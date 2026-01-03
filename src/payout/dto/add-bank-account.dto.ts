import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AddBankAccountDto {
  @IsNotEmpty()
  @IsString()
  iban: string; // IBAN (International Bank Account Number)

  @IsNotEmpty()
  @IsString()
  bankName: string; // Bank name

  @IsNotEmpty()
  @IsString()
  accountHolderName: string; // Account holder name

  @IsOptional()
  @IsString()
  accountNumber?: string; // Account number (optional, some countries use IBAN only)

  @IsOptional()
  @IsString()
  swiftCode?: string; // SWIFT/BIC code

  @IsOptional()
  @IsString()
  routingNumber?: string; // Routing number (for US banks)

  @IsOptional()
  @IsString()
  address?: string; // Bank address

  @IsOptional()
  @IsString()
  city?: string; // City

  @IsOptional()
  @IsString()
  country?: string; // Country

  @IsOptional()
  @IsString()
  postalCode?: string; // Postal code
}

