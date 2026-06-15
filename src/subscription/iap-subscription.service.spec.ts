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
        service.verify('user123', {
          platform: IapPlatform.IOS,
          productId: 'unknown.product',
          transactionId: 'tx-1',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns idempotent response when transaction already linked to same user', async () => {
      const existingSub = {
        userId: { toString: () => 'user123' },
        source: 'apple',
        platform: 'ios',
        plan: 'premium',
        status: 'active',
        productId: 'com.theactivecircle.app.premium.monthly',
        currentPeriodEnd: new Date('2026-07-01'),
      };

      mockSubscriptionModel.findOne.mockResolvedValue(existingSub);
      mockUsersService.findOne.mockResolvedValue({ _id: 'user123', role: 'premiumMember' });

      const result = await service.verify('user123', {
        platform: IapPlatform.IOS,
        productId: 'com.theactivecircle.app.premium.monthly',
        transactionId: 'tx-1',
        signedTransaction: 'signed-jws',
      });

      expect(result.statusCode).toBe(200);
      expect(result.message).toBe('Subscription verified');
      expect(mockAppleIapService.verifyPurchase).not.toHaveBeenCalled();
    });
  });

  describe('getMyEntitlement', () => {
    it('returns basic entitlement when user has no subscriptions', async () => {
      mockUserModel.findById.mockResolvedValue({
        _id: 'user123',
        hasActiveSubscription: false,
        role: 'member',
        isLifetimeHost: false,
      });
      mockSubscriptionModel.find.mockResolvedValue([]);

      const result = await service.getMyEntitlement('user123');

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
