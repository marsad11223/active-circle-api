import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException } from '@nestjs/common';
import { IapSubscriptionService } from './iap-subscription.service';
import { AppleIapService } from './apple-iap.service';
import { GoogleIapService } from './google-iap.service';
import { UsersService } from '../users/users.service';
import { Subscription } from '../schemas/subscription.schema';
import { User } from '../schemas/user.schema';
import { IapPlatform } from './dto/verify-subscription.dto';

describe('IapSubscriptionService', () => {
  let service: IapSubscriptionService;
  const userId = '507f1f77bcf86cd799439011';
  const otherUserId = '507f1f77bcf86cd799439012';

  const mockSubscriptionModel = {
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    find: jest.fn(),
  };

  const mockUserModel = {
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
  };

  const mockAppleIapService = {
    verifyPurchase: jest.fn(),
    decodeNotification: jest.fn(),
    decodeTransaction: jest.fn(),
  };

  const mockGoogleIapService = {
    verifyPurchase: jest.fn(),
    decodePubSubMessage: jest.fn(),
  };

  const mockUsersService = {
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IapSubscriptionService,
        { provide: getModelToken(Subscription.name), useValue: mockSubscriptionModel },
        { provide: getModelToken(User.name), useValue: mockUserModel },
        { provide: AppleIapService, useValue: mockAppleIapService },
        { provide: GoogleIapService, useValue: mockGoogleIapService },
        { provide: UsersService, useValue: mockUsersService },
      ],
    }).compile();

    service = module.get(IapSubscriptionService);
  });

  describe('verify', () => {
    it('rejects unknown product IDs', async () => {
      await expect(
        service.verify(userId, {
          platform: IapPlatform.IOS,
          productId: 'unknown.product',
          transactionId: 'tx-1',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns idempotent response when transaction already linked to same user', async () => {
      const existingSub = {
        userId: { toString: () => userId },
        source: 'apple',
        platform: 'ios',
        plan: 'premium',
        status: 'active',
        productId: 'com.theactivecircle.app.premium.monthly',
        currentPeriodEnd: new Date('2026-07-01'),
      };

      mockSubscriptionModel.findOne.mockResolvedValue(existingSub);
      mockUsersService.findOne.mockResolvedValue({ _id: userId, role: 'premiumMember' });

      const result = await service.verify(userId, {
        platform: IapPlatform.IOS,
        productId: 'com.theactivecircle.app.premium.monthly',
        transactionId: 'tx-1',
        signedTransaction: 'signed-jws',
      });

      expect(result.statusCode).toBe(200);
      expect(result.message).toBe('Subscription verified');
      expect(mockAppleIapService.verifyPurchase).not.toHaveBeenCalled();
    });

    describe('Android', () => {
      const androidDto = {
        platform: IapPlatform.ANDROID,
        productId: 'standard_monthly',
        transactionId: 'GPA.mobile-order-id',
        purchaseToken: 'google-purchase-token-abc',
        packageName: 'com.theactivecircle.app',
      };

      const verifiedPurchase = {
        productId: 'standard_monthly',
        transactionId: 'GPA.google-latest-order-id',
        purchaseToken: 'google-purchase-token-abc',
        expiryDate: new Date('2026-07-01'),
        autoRenewing: true,
        status: 'active' as const,
        rawPayload: {},
      };

      it('verifies a new Android purchase and grants entitlement', async () => {
        mockSubscriptionModel.findOne.mockResolvedValue(null);
        mockGoogleIapService.verifyPurchase.mockResolvedValue(verifiedPurchase);
        mockSubscriptionModel.findOneAndUpdate.mockResolvedValue({
          userId: { toString: () => userId },
          source: 'google',
          platform: 'android',
          plan: 'standard',
          status: 'active',
          productId: 'standard_monthly',
          purchaseToken: 'google-purchase-token-abc',
          transactionId: 'GPA.google-latest-order-id',
          currentPeriodEnd: new Date('2026-07-01'),
        });
        mockUsersService.findOne.mockResolvedValue({
          _id: userId,
          role: 'standardMember',
          hasActiveSubscription: true,
        });

        const result = await service.verify(userId, androidDto);

        expect(result.statusCode).toBe(200);
        expect(result.message).toBe('Subscription verified');
        expect(mockSubscriptionModel.findOne).toHaveBeenCalledWith({
          purchaseToken: 'google-purchase-token-abc',
        });
        expect(mockGoogleIapService.verifyPurchase).toHaveBeenCalledWith({
          purchaseToken: 'google-purchase-token-abc',
          productId: 'standard_monthly',
          packageName: 'com.theactivecircle.app',
        });
        expect(mockSubscriptionModel.findOneAndUpdate).toHaveBeenCalledWith(
          { purchaseToken: 'google-purchase-token-abc' },
          expect.any(Object),
          { upsert: true, new: true },
        );
        expect(mockUserModel.findByIdAndUpdate).toHaveBeenCalledWith(
          userId,
          expect.objectContaining({
            role: 'standardMember',
            hasActiveSubscription: true,
          }),
        );
      });

      it('returns idempotent response when purchaseToken already linked to same user', async () => {
        const existingSub = {
          userId: { toString: () => userId },
          source: 'google',
          platform: 'android',
          plan: 'standard',
          status: 'active',
          productId: 'standard_monthly',
          purchaseToken: 'google-purchase-token-abc',
          transactionId: 'GPA.google-latest-order-id',
          currentPeriodEnd: new Date('2026-07-01'),
        };

        mockSubscriptionModel.findOne.mockResolvedValue(existingSub);
        mockUsersService.findOne.mockResolvedValue({
          _id: userId,
          role: 'standardMember',
        });

        const result = await service.verify(userId, {
          ...androidDto,
          transactionId: 'different-mobile-tx-id',
        });

        expect(result.statusCode).toBe(200);
        expect(result.message).toBe('Subscription verified');
        expect(mockGoogleIapService.verifyPurchase).not.toHaveBeenCalled();
        expect(mockSubscriptionModel.findOneAndUpdate).not.toHaveBeenCalled();
      });

      it('rejects when purchaseToken is linked to another account', async () => {
        mockSubscriptionModel.findOne.mockResolvedValue({
          userId: { toString: () => otherUserId },
          source: 'google',
          platform: 'android',
          plan: 'standard',
          status: 'active',
          productId: 'standard_monthly',
          purchaseToken: 'google-purchase-token-abc',
        });

        await expect(service.verify(userId, androidDto)).rejects.toThrow(
          new BadRequestException('Purchase already linked to another account'),
        );
        expect(mockGoogleIapService.verifyPurchase).not.toHaveBeenCalled();
      });

      it('rejects unknown Android product IDs', async () => {
        await expect(
          service.verify(userId, {
            ...androidDto,
            productId: 'unknown_android_product',
          }),
        ).rejects.toThrow(BadRequestException);
        expect(mockSubscriptionModel.findOne).not.toHaveBeenCalled();
        expect(mockGoogleIapService.verifyPurchase).not.toHaveBeenCalled();
      });

      it('requires purchaseToken for Android', async () => {
        await expect(
          service.verify(userId, {
            platform: IapPlatform.ANDROID,
            productId: 'standard_monthly',
            transactionId: 'GPA.mobile-order-id',
          }),
        ).rejects.toThrow(
          new BadRequestException('purchaseToken is required for Android'),
        );
        expect(mockSubscriptionModel.findOne).not.toHaveBeenCalled();
        expect(mockGoogleIapService.verifyPurchase).not.toHaveBeenCalled();
      });
    });
  });

  describe('getMyEntitlement', () => {
    it('returns basic entitlement when user has no subscriptions', async () => {
      mockUserModel.findById.mockResolvedValue({
        _id: userId,
        hasActiveSubscription: false,
        role: 'member',
        isLifetimeHost: false,
      });
      mockSubscriptionModel.find.mockResolvedValue([]);

      const result = await service.getMyEntitlement(userId);

      expect(result.statusCode).toBe(200);
      expect(result.data).toMatchObject({
        isActive: false,
        hasActiveSubscription: false,
        tier: 'basic',
        source: 'none',
        status: 'none',
        managedByStore: false,
      });
    });
  });
});
