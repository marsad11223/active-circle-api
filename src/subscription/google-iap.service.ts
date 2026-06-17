import {
  Injectable,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { EntitlementStatus, VerifiedPurchase } from './iap.constants';
import { FREE_TRIAL_DAYS } from './subscription.constants';

@Injectable()
export class GoogleIapService {
  private packageName: string;

  constructor(private readonly configService: ConfigService) {
    this.packageName =
      this.configService.get<string>('GOOGLE_PLAY_PACKAGE_NAME') ||
      'com.theactivecircle.app';
  }

  private getAuthClient() {
    const serviceAccountJson = this.configService.get<string>(
      'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON',
    );
    if (!serviceAccountJson) {
      return null;
    }

    let credentials: Record<string, unknown>;
    try {
      credentials = JSON.parse(serviceAccountJson);
    } catch {
      throw new BadRequestException('Invalid Google Play service account JSON');
    }

    return new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    });
  }

  async verifyPurchase(input: {
    purchaseToken: string;
    productId: string;
    packageName?: string;
  }): Promise<VerifiedPurchase> {
    const auth = this.getAuthClient();
    if (!auth) {
      throw new BadRequestException('Purchase could not be verified');
    }

    const packageName = input.packageName || this.packageName;

    try {
      const androidpublisher = google.androidpublisher({
        version: 'v3',
        auth,
      });

      const response = await androidpublisher.purchases.subscriptionsv2.get({
        packageName,
        token: input.purchaseToken,
      });

      const subscription = response.data;
      const lineItem = subscription.lineItems?.[0];
      if (!lineItem) {
        throw new BadRequestException('Purchase could not be verified');
      }

      const productId = lineItem.productId || input.productId;
      if (productId !== input.productId) {
        throw new BadRequestException('Purchase could not be verified');
      }

      const expiryDate = lineItem.expiryTime
        ? new Date(lineItem.expiryTime)
        : new Date(Date.now() + FREE_TRIAL_DAYS * 24 * 60 * 60 * 1000);

      const status = this.mapGoogleStatus(
        subscription.subscriptionState,
        expiryDate,
        lineItem.offerDetails,
      );

      const trialEndsAt =
        lineItem.offerDetails?.offerId && expiryDate ? expiryDate : undefined;

      return {
        productId,
        transactionId:
          subscription.latestOrderId || input.purchaseToken.slice(0, 32),
        originalTransactionId: subscription.linkedPurchaseToken ?? undefined,
        purchaseToken: input.purchaseToken,
        expiryDate,
        trialEndsAt,
        autoRenewing: lineItem.autoRenewingPlan?.autoRenewEnabled ?? true,
        status,
        rawPayload: subscription as Record<string, unknown>,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        'Purchase could not be verified',
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
  }

  private mapGoogleStatus(
    subscriptionState?: string | null,
    expiryDate?: Date,
    offerDetails?: { offerId?: string | null } | null,
  ): EntitlementStatus {
    const isTrialOffer =
      Boolean(offerDetails?.offerId) &&
      expiryDate &&
      expiryDate.getTime() > Date.now();

    switch (subscriptionState) {
      case 'SUBSCRIPTION_STATE_ACTIVE':
        return isTrialOffer ? 'trialing' : 'active';
      case 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD':
        return 'grace_period';
      case 'SUBSCRIPTION_STATE_CANCELED':
        return expiryDate && expiryDate.getTime() > Date.now()
          ? 'cancelled'
          : 'expired';
      case 'SUBSCRIPTION_STATE_ON_HOLD':
        return 'paused';
      case 'SUBSCRIPTION_STATE_PAUSED':
        return 'paused';
      case 'SUBSCRIPTION_STATE_EXPIRED':
        return 'expired';
      default:
        if (expiryDate && expiryDate.getTime() < Date.now()) {
          return 'expired';
        }
        return 'active';
    }
  }

  decodePubSubMessage(body: {
    message?: { data?: string };
  }): Record<string, unknown> | null {
    const data = body?.message?.data;
    if (!data) return null;

    try {
      const decoded = Buffer.from(data, 'base64').toString('utf8');
      return JSON.parse(decoded);
    } catch {
      return null;
    }
  }
}
