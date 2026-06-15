import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';

export enum IapPlatform {
  IOS = 'ios',
  ANDROID = 'android',
}

export class VerifySubscriptionDto {
  @IsEnum(IapPlatform)
  platform: IapPlatform;

  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsString()
  @IsNotEmpty()
  transactionId: string;

  @IsOptional()
  @IsString()
  originalTransactionId?: string;

  @ValidateIf((o) => o.platform === IapPlatform.ANDROID)
  @IsString()
  @IsNotEmpty()
  purchaseToken?: string;

  @IsOptional()
  @IsString()
  packageName?: string;

  @IsOptional()
  @IsString()
  signedTransaction?: string;

  @IsOptional()
  @IsString()
  receiptData?: string;
}
