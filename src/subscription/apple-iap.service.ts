import {
  Injectable,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AppStoreServerAPIClient,
  Environment,
  SignedDataVerifier,
} from '@apple/app-store-server-library';
import { readFile } from 'fs';
import { promisify } from 'util';
import { join } from 'path';
import { EntitlementStatus, VerifiedPurchase } from './iap.constants';
import { FREE_TRIAL_DAYS } from './subscription.constants';

const readFileAsync = promisify(readFile);

@Injectable()
export class AppleIapService {
  private verifier: SignedDataVerifier | null = null;
  private apiClient: AppStoreServerAPIClient | null = null;
  private bundleId: string;
  private appAppleId: number;
  private environment: Environment;

  constructor(private readonly configService: ConfigService) {
    this.bundleId =
      this.configService.get<string>('APPLE_BUNDLE_ID') ||
      'com.theactivecircle.app';
    this.appAppleId = Number(
      this.configService.get<string>('APPLE_APP_ID') || '6768298207',
    );
    const iapEnv = this.configService.get<string>('IAP_ENV') || 'sandbox';
    this.environment =
      iapEnv === 'production' ? Environment.PRODUCTION : Environment.SANDBOX;
  }

  private async getVerifier(): Promise<SignedDataVerifier> {
    if (this.verifier) return this.verifier;

    const rootCerts = await this.loadAppleRootCertificates();
    this.verifier = new SignedDataVerifier(
      rootCerts,
      true,
      this.environment,
      this.bundleId,
      this.appAppleId,
    );
    return this.verifier;
  }

  private async getApiClient(): Promise<AppStoreServerAPIClient | null> {
    if (this.apiClient) return this.apiClient;

    const keyId = this.configService.get<string>('APPLE_IAP_KEY_ID');
    const issuerId = this.configService.get<string>('APPLE_IAP_ISSUER_ID');
    const privateKey = this.normalizePrivateKey(
      this.configService.get<string>('APPLE_IAP_PRIVATE_KEY'),
    );

    if (!keyId || !issuerId || !privateKey) {
      return null;
    }

    this.apiClient = new AppStoreServerAPIClient(
      privateKey,
      keyId,
      issuerId,
      this.bundleId,
      this.environment,
    );
    return this.apiClient;
  }

  private normalizePrivateKey(key?: string): string | undefined {
    if (!key) return undefined;
    return key.replace(/\\n/g, '\n');
  }

  private async loadAppleRootCertificates(): Promise<Buffer[]> {
    const certDir = join(
      process.cwd(),
      'node_modules',
      '@apple',
      'app-store-server-library',
      'dist',
      'certs',
    );
    const certFiles = [
      'AppleRootCA-G3.cer',
      'AppleRootCA-G2.cer',
      'AppleComputerRootCertificate.cer',
      'AppleIncRootCertificate.cer',
    ];

    const certs: Buffer[] = [];
    for (const file of certFiles) {
      try {
        const data = await readFileAsync(join(certDir, file));
        certs.push(data);
      } catch {
        // Some cert files may not exist in all library versions
      }
    }

    if (certs.length === 0) {
      throw new Error('Could not load Apple root certificates');
    }
    return certs;
  }

  async verifyPurchase(input: {
    signedTransaction?: string;
    transactionId?: string;
    receiptData?: string;
    productId: string;
  }): Promise<VerifiedPurchase> {
    if (input.signedTransaction) {
      return this.verifySignedTransaction(
        input.signedTransaction,
        input.productId,
      );
    }

    if (input.transactionId) {
      return this.verifyByTransactionId(input.transactionId, input.productId);
    }

    throw new BadRequestException('Purchase could not be verified');
  }

  private async verifySignedTransaction(
    signedTransaction: string,
    expectedProductId: string,
  ): Promise<VerifiedPurchase> {
    try {
      const verifier = await this.getVerifier();
      const decoded =
        await verifier.verifyAndDecodeTransaction(signedTransaction);

      if (decoded.productId !== expectedProductId) {
        throw new BadRequestException('Purchase could not be verified');
      }

      return this.mapAppleTransaction(decoded);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new BadRequestException('Purchase could not be verified');
    }
  }

  private async verifyByTransactionId(
    transactionId: string,
    expectedProductId: string,
  ): Promise<VerifiedPurchase> {
    const client = await this.getApiClient();
    if (!client) {
      throw new BadRequestException('Purchase could not be verified');
    }

    try {
      const response = await client.getTransactionInfo(transactionId);
      if (!response.signedTransactionInfo) {
        throw new BadRequestException('Purchase could not be verified');
      }

      const verifier = await this.getVerifier();
      const decoded = await verifier.verifyAndDecodeTransaction(
        response.signedTransactionInfo,
      );

      if (decoded.productId !== expectedProductId) {
        throw new BadRequestException('Purchase could not be verified');
      }

      return this.mapAppleTransaction(decoded);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        'Purchase could not be verified',
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
  }

  private mapAppleTransaction(decoded: Record<string, any>): VerifiedPurchase {
    const expiresDate = decoded.expiresDate
      ? new Date(Number(decoded.expiresDate))
      : new Date(Date.now() + FREE_TRIAL_DAYS * 24 * 60 * 60 * 1000);

    const trialEndsAt =
      decoded.offerType === 1 && decoded.expiresDate
        ? new Date(Number(decoded.expiresDate))
        : undefined;

    const revocationDate = decoded.revocationDate
      ? new Date(Number(decoded.revocationDate))
      : undefined;

    let status: EntitlementStatus = 'active';
    if (revocationDate) {
      status = 'refunded';
    } else if (expiresDate.getTime() < Date.now()) {
      status = 'expired';
    } else if (decoded.offerType === 1) {
      status = 'trialing';
    }

    return {
      productId: decoded.productId,
      transactionId: decoded.transactionId,
      originalTransactionId: decoded.originalTransactionId,
      expiryDate: expiresDate,
      trialEndsAt,
      autoRenewing: true,
      status,
      rawPayload: decoded,
    };
  }

  async decodeNotification(
    signedPayload: string,
  ): Promise<Record<string, any>> {
    const verifier = await this.getVerifier();
    return verifier.verifyAndDecodeNotification(signedPayload);
  }

  async decodeTransaction(
    signedTransaction: string,
  ): Promise<Record<string, any>> {
    const verifier = await this.getVerifier();
    return verifier.verifyAndDecodeTransaction(signedTransaction);
  }
}
