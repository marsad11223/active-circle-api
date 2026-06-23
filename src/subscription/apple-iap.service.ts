import {
  Injectable,
  BadRequestException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AppStoreServerAPIClient,
  Environment,
  SignedDataVerifier,
  VerificationException,
  VerificationStatus,
} from '@apple/app-store-server-library';
import { readFile } from 'fs';
import { promisify } from 'util';
import { join } from 'path';
import { EntitlementStatus, VerifiedPurchase } from './iap.constants';
import { FREE_TRIAL_DAYS } from './subscription.constants';

const readFileAsync = promisify(readFile);

const APPLE_ROOT_CERT_FILES = [
  'AppleRootCA-G3.cer',
  'AppleRootCA-G2.cer',
  'AppleIncRootCertificate.cer',
  'AppleComputerRootCertificate.cer',
];

@Injectable()
export class AppleIapService {
  private readonly logger = new Logger(AppleIapService.name);
  private rootCertificates: Buffer[] | null = null;
  private readonly verifiers = new Map<Environment, SignedDataVerifier>();
  private readonly apiClients = new Map<Environment, AppStoreServerAPIClient>();

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

  private certDirectoryCandidates(): string[] {
    return [
      join(process.cwd(), 'certs', 'apple'),
      join(__dirname, '..', '..', 'certs', 'apple'),
      join(__dirname, '..', 'certs', 'apple'),
      join(__dirname, '..', 'apple'),
    ];
  }

  private async loadAppleRootCertificates(): Promise<Buffer[]> {
    if (this.rootCertificates) {
      return this.rootCertificates;
    }

    const certs: Buffer[] = [];
    let lastTriedDir = '';

    for (const certDir of this.certDirectoryCandidates()) {
      lastTriedDir = certDir;
      certs.length = 0;

      for (const file of APPLE_ROOT_CERT_FILES) {
        try {
          const data = await readFileAsync(join(certDir, file));
          certs.push(data);
        } catch {
          // Try next file / directory
        }
      }

      if (certs.length > 0) {
        this.logger.log(
          `Loaded ${certs.length} Apple root certificate(s) from ${certDir}`,
        );
        this.rootCertificates = certs;
        return certs;
      }
    }

    throw new Error(
      `No Apple root certificates found (last path: ${lastTriedDir}). ` +
        'Add certs under certs/apple/ — see docs/IAP_ENV.md',
    );
  }

  private async getVerifier(env: Environment): Promise<SignedDataVerifier> {
    const cached = this.verifiers.get(env);
    if (cached) return cached;

    const rootCerts = await this.loadAppleRootCertificates();
    const verifier =
      env === Environment.PRODUCTION
        ? new SignedDataVerifier(
            rootCerts,
            true,
            env,
            this.bundleId,
            this.appAppleId,
          )
        : new SignedDataVerifier(rootCerts, true, env, this.bundleId);

    this.verifiers.set(env, verifier);
    return verifier;
  }

  private verificationEnvironments(): Environment[] {
    return this.environment === Environment.SANDBOX
      ? [Environment.SANDBOX, Environment.PRODUCTION]
      : [Environment.PRODUCTION, Environment.SANDBOX];
  }

  private normalizeSignedTransaction(value?: string): string | undefined {
    if (!value) return undefined;

    let trimmed = value.trim();
    if (!trimmed) return undefined;

    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown>;
        const nested =
          parsed.signedTransaction ??
          parsed.signedTransactionInfo ??
          parsed.transactionReceipt ??
          parsed.purchaseToken;
        if (typeof nested === 'string') {
          trimmed = nested.trim();
        }
      } catch {
        // Use raw string below
      }
    }

    return trimmed.startsWith('eyJ') ? trimmed : undefined;
  }

  private isEnvironmentMismatch(error: unknown): boolean {
    return (
      error instanceof VerificationException &&
      error.status === VerificationStatus.INVALID_ENVIRONMENT
    );
  }

  private logVerificationFailure(
    context: string,
    error: unknown,
    env?: Environment,
  ) {
    if (error instanceof VerificationException) {
      this.logger.warn(
        `Apple ${context} failed${env ? ` (${env})` : ''}: ${VerificationStatus[error.status]}`,
      );
      return;
    }
    if (error instanceof Error) {
      this.logger.warn(
        `Apple ${context} failed${env ? ` (${env})` : ''}: ${error.message}`,
      );
      return;
    }
    this.logger.warn(`Apple ${context} failed${env ? ` (${env})` : ''}`);
  }

  private async decodeSignedTransaction(
    signedTransaction: string,
  ): Promise<Record<string, any>> {
    let lastError: unknown;

    for (const env of this.verificationEnvironments()) {
      try {
        const verifier = await this.getVerifier(env);
        const decoded =
          await verifier.verifyAndDecodeTransaction(signedTransaction);

        if (env !== this.environment) {
          this.logger.log(
            `Apple JWS verified with ${env} verifier (IAP_ENV=${this.environment})`,
          );
        }

        return decoded as Record<string, any>;
      } catch (error) {
        lastError = error;
        if (this.isEnvironmentMismatch(error)) {
          continue;
        }
        throw error;
      }
    }

    throw lastError;
  }

  private async getApiClient(
    env: Environment,
  ): Promise<AppStoreServerAPIClient | null> {
    const cached = this.apiClients.get(env);
    if (cached) return cached;

    const keyId = this.configService.get<string>('APPLE_IAP_KEY_ID');
    const issuerId = this.configService.get<string>('APPLE_IAP_ISSUER_ID');
    const privateKey = this.normalizePrivateKey(
      this.configService.get<string>('APPLE_IAP_PRIVATE_KEY'),
    );

    if (!keyId || !issuerId || !privateKey) {
      return null;
    }

    const client = new AppStoreServerAPIClient(
      privateKey,
      keyId,
      issuerId,
      this.bundleId,
      env,
    );
    this.apiClients.set(env, client);
    return client;
  }

  private normalizePrivateKey(key?: string): string | undefined {
    if (!key) return undefined;
    return key.replace(/\\n/g, '\n');
  }

  async verifyPurchase(input: {
    signedTransaction?: string;
    transactionId?: string;
    receiptData?: string;
    productId: string;
  }): Promise<VerifiedPurchase> {
    const signedTransaction = this.normalizeSignedTransaction(
      input.signedTransaction,
    );

    if (signedTransaction) {
      return this.verifySignedTransaction(signedTransaction, input.productId);
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
      const decoded = await this.decodeSignedTransaction(signedTransaction);

      if (decoded.productId !== expectedProductId) {
        this.logger.warn(
          `Apple productId mismatch: expected ${expectedProductId}, got ${decoded.productId}`,
        );
        throw new BadRequestException('Purchase could not be verified');
      }

      return this.mapAppleTransaction(decoded);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logVerificationFailure('signedTransaction verify', error);
      throw new BadRequestException('Purchase could not be verified');
    }
  }

  private async verifyByTransactionId(
    transactionId: string,
    expectedProductId: string,
  ): Promise<VerifiedPurchase> {
    let sawMissingCredentials = false;
    let lastError: unknown;

    for (const env of this.verificationEnvironments()) {
      const client = await this.getApiClient(env);
      if (!client) {
        sawMissingCredentials = true;
        continue;
      }

      try {
        const response = await client.getTransactionInfo(transactionId);
        if (!response.signedTransactionInfo) {
          throw new BadRequestException('Purchase could not be verified');
        }

        const decoded = await this.decodeSignedTransaction(
          response.signedTransactionInfo,
        );

        if (decoded.productId !== expectedProductId) {
          throw new BadRequestException('Purchase could not be verified');
        }

        return this.mapAppleTransaction(decoded);
      } catch (error) {
        lastError = error;
        if (error instanceof HttpException) throw error;
        this.logVerificationFailure('getTransactionInfo', error, env);
      }
    }

    if (sawMissingCredentials && !lastError) {
      this.logger.warn(
        'Apple getTransactionInfo skipped: APPLE_IAP_KEY_ID, APPLE_IAP_ISSUER_ID, or APPLE_IAP_PRIVATE_KEY not set',
      );
    }

    if (lastError instanceof HttpException) throw lastError;
    throw new HttpException(
      'Purchase could not be verified',
      HttpStatus.PAYMENT_REQUIRED,
    );
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
    let lastError: unknown;

    for (const env of this.verificationEnvironments()) {
      try {
        const verifier = await this.getVerifier(env);
        return await verifier.verifyAndDecodeNotification(signedPayload);
      } catch (error) {
        lastError = error;
        if (this.isEnvironmentMismatch(error)) continue;
        throw error;
      }
    }

    throw lastError;
  }

  async decodeTransaction(
    signedTransaction: string,
  ): Promise<Record<string, any>> {
    return this.decodeSignedTransaction(signedTransaction);
  }
}
