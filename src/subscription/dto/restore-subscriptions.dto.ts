import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { IapPlatform } from './verify-subscription.dto';

export class RestorePurchaseItemDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsString()
  @IsNotEmpty()
  transactionId: string;

  @IsOptional()
  @IsString()
  originalTransactionId?: string;

  @IsOptional()
  @IsString()
  purchaseToken?: string;

  @IsOptional()
  @IsString()
  signedTransaction?: string;
}

export class RestoreSubscriptionsDto {
  @IsEnum(IapPlatform)
  platform: IapPlatform;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RestorePurchaseItemDto)
  purchases: RestorePurchaseItemDto[];
}
