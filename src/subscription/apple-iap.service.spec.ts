import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, HttpException } from '@nestjs/common';
import { AppleIapService } from './apple-iap.service';

describe('AppleIapService', () => {
  let service: AppleIapService;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const values: Record<string, string> = {
        APPLE_BUNDLE_ID: 'com.theactivecircle.app',
        APPLE_APP_ID: '6768298207',
        IAP_ENV: 'sandbox',
      };
      return values[key];
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppleIapService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get(AppleIapService);
  });

  it('loads Apple root certificates from certs/apple', async () => {
    const certs = await (service as any).loadAppleRootCertificates();
    expect(certs.length).toBeGreaterThan(0);
  });

  describe('verifyPurchase', () => {
    it('rejects when no signedTransaction and no API credentials', async () => {
      await expect(
        service.verifyPurchase({
          transactionId: '2000000123456789',
          productId: 'com.theactivecircle.app.standard.monthly',
        }),
      ).rejects.toThrow(HttpException);
    });

    it('falls back to transactionId when signedTransaction is not a JWS', async () => {
      await expect(
        service.verifyPurchase({
          signedTransaction: 'not-a-jws-token',
          transactionId: '2000000123456789',
          productId: 'com.theactivecircle.app.standard.monthly',
        }),
      ).rejects.toThrow(HttpException);
    });

    it('rejects malformed JWS without credentials fallback', async () => {
      await expect(
        service.verifyPurchase({
          signedTransaction: 'eyJ.invalid.jws',
          transactionId: '2000000123456789',
          productId: 'com.theactivecircle.app.standard.monthly',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
