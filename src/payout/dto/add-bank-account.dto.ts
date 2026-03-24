import { IsNotEmpty, IsOptional, IsString, ValidateIf } from 'class-validator';

export class AddBankAccountDto {
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  bankName?: string; // Bank name (optional)

  @IsNotEmpty()
  @IsString()
  accountHolderName: string; // Account holder name (required)

  @ValidateIf((o) => !o.accountNumber)
  @IsNotEmpty({ message: 'Either IBAN or Account Number is required' })
  @IsString()
  iban?: string; // IBAN (required if accountNumber is not provided)

  @ValidateIf((o) => !o.iban)
  @IsNotEmpty({ message: 'Either IBAN or Account Number is required' })
  @IsString()
  accountNumber?: string; // Account number (required if IBAN is not provided)

  @IsNotEmpty()
  @IsString()
  swiftCode: string; // SWIFT/BIC code (required)

  @IsOptional()
  @IsString()
  routingNumber?: string; // Routing number (optional, for US banks)

  @IsOptional()
  @IsString()
  address?: string; // Bank address (optional)

  @IsOptional()
  @IsString()
  city?: string; // City (optional)

  @IsOptional()
  @IsString()
  country?: string; // Country (optional)

  @IsOptional()
  @IsString()
  postalCode?: string; // Postal code (optional)
}
