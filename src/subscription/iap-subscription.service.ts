import {
  Injectable,
  BadRequestException,
  NotFoundException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import mongoose from 'mongoose';
import {
  Subscription,
  SubscriptionPlan,
  SubscriptionPlatform,
  SubscriptionSource,
  SubscriptionStatus,
} from '../schemas/subscription.schema';
import { GrantRole, Role, User } from '../schemas/user.schema';
import { AppleIapService } from './apple-iap.service';
import { GoogleIapService } from './google-iap.service';
import {
  VerifySubscriptionDto,
  IapPlatform,
} from './dto/verify-subscription.dto';
import {
  RestoreSubscriptionsDto,
  RestorePurchaseItemDto,
} from './dto/restore-subscriptions.dto';
import {
  ACTIVE_ENTITLEMENT_STATUSES,
  EntitlementSource,
  EntitlementStatus,
  EntitlementTier,
  IAP_PRODUCT_MAP,
  SubscriptionEntitlement,
  TIER_PRIORITY,
  VerifiedPurchase,
} from './iap.constants';
import { UsersService } from '../users/users.service';

@Injectable()
export class IapSubscriptionService {
  constructor(
    @InjectModel(Subscription.name)
    private readonly subscriptionModel: Model<Subscription>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly appleIapService: AppleIapService,
    private readonly googleIapService: GoogleIapService,
    private readonly usersService: UsersService,
  ) {}

  async verify(userId: string, dto: VerifySubscriptionDto) {
    const productConfig = IAP_PRODUCT_MAP[dto.productId];
    if (!productConfig) {
      throw new BadRequestException(`Unknown product ID: ${dto.productId}`);
    }

    const platform =
      dto.platform === IapPlatform.IOS
        ? SubscriptionPlatform.IOS
        : SubscriptionPlatform.ANDROID;
    const source =
      dto.platform === IapPlatform.IOS
        ? SubscriptionSource.APPLE
        : SubscriptionSource.GOOGLE;

    if (dto.platform === IapPlatform.IOS) {
      const existing = await this.findExistingIosSubscription(dto);

      if (existing) {
        return this.returnIdempotentVerify(userId, existing);
      }
    } else {
      if (!dto.purchaseToken) {
        throw new BadRequestException('purchaseToken is required for Android');
      }

      const existing = await this.subscriptionModel.findOne({
        purchaseToken: dto.purchaseToken,
      });

      if (existing) {
        return this.returnIdempotentVerify(userId, existing);
      }
    }

    const verified = await this.validateWithStore(dto);

    if (platform === SubscriptionPlatform.IOS) {
      await this.assertIosPurchaseAvailable(userId, verified);
    }

    const subscription = await this.upsertIapSubscription({
      userId,
      source,
      platform,
      productConfig,
      verified,
    });

    await this.grantEntitlement(userId, productConfig.role);

    const entitlement =
      await this.buildEntitlementFromSubscription(subscription);
    const user = await this.usersService.findOne(userId);

    return this.wrapVerifyResponse(entitlement, user);
  }

  async getMyEntitlement(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    if (user.isLifetimeHost) {
      return this.wrapMeResponse({
        isActive: true,
        hasActiveSubscription: true,
        tier: 'premium',
        source: 'none',
        status: 'active',
        managedByStore: false,
      });
    }

    const entitlement = await this.resolveBestEntitlement(userId);
    await this.syncUserFromEntitlement(userId, entitlement, user);

    return this.wrapMeResponse(entitlement);
  }

  async restore(userId: string, dto: RestoreSubscriptionsDto) {
    let bestSubscription: Subscription | null = null;
    let bestTier: EntitlementTier = 'basic';

    for (const purchase of dto.purchases) {
      const productConfig = IAP_PRODUCT_MAP[purchase.productId];
      if (!productConfig) continue;

      try {
        const verifyDto: VerifySubscriptionDto = {
          platform: dto.platform,
          productId: purchase.productId,
          transactionId: purchase.transactionId,
          originalTransactionId: purchase.originalTransactionId,
          purchaseToken: purchase.purchaseToken,
          signedTransaction: purchase.signedTransaction,
        };

        const verified = await this.validateWithStore(verifyDto);
        if (!ACTIVE_ENTITLEMENT_STATUSES.includes(verified.status)) continue;

        const platform =
          dto.platform === IapPlatform.IOS
            ? SubscriptionPlatform.IOS
            : SubscriptionPlatform.ANDROID;
        const source =
          dto.platform === IapPlatform.IOS
            ? SubscriptionSource.APPLE
            : SubscriptionSource.GOOGLE;

        const subscription = await this.upsertIapSubscription({
          userId,
          source,
          platform,
          productConfig,
          verified,
        });

        if (TIER_PRIORITY[productConfig.tier] >= TIER_PRIORITY[bestTier]) {
          bestTier = productConfig.tier;
          bestSubscription = subscription;
        }
      } catch {
        // Try next purchase in the restore batch
      }
    }

    if (!bestSubscription) {
      const user = await this.usersService.findOne(userId);
      const entitlement = await this.resolveBestEntitlement(userId);
      return {
        statusCode: 200,
        message: 'No active subscription found',
        data: {
          entitlement,
          user,
          restored: false,
        },
      };
    }

    const productConfig = IAP_PRODUCT_MAP[bestSubscription.productId!];
    await this.grantEntitlement(userId, productConfig.role);

    const entitlement =
      await this.buildEntitlementFromSubscription(bestSubscription);
    const user = await this.usersService.findOne(userId);

    return {
      statusCode: 200,
      message: 'Subscription restored',
      data: {
        entitlement,
        user,
        restored: true,
      },
    };
  }

  async handleAppleWebhook(body: { signedPayload?: string }) {
    if (!body?.signedPayload) {
      throw new BadRequestException('Missing signedPayload');
    }

    const notification = await this.appleIapService.decodeNotification(
      body.signedPayload,
    );

    const notificationType = notification.notificationType;
    const data = notification.data || {};
    const signedTransactionInfo = data.signedTransactionInfo as
      | string
      | undefined;

    if (!signedTransactionInfo) {
      return { received: true };
    }

    let transaction: Record<string, any>;
    try {
      transaction = await this.appleIapService.decodeTransaction(
        signedTransactionInfo,
      );
    } catch {
      return { received: true };
    }

    await this.applyStoreUpdate({
      source: SubscriptionSource.APPLE,
      platform: SubscriptionPlatform.IOS,
      productId: transaction.productId,
      transactionId: transaction.transactionId,
      originalTransactionId: transaction.originalTransactionId,
      expiryDate: transaction.expiresDate
        ? new Date(Number(transaction.expiresDate))
        : undefined,
      notificationType,
      rawPayload: notification,
    });

    return { received: true };
  }

  async handleGoogleWebhook(body: Record<string, unknown>) {
    const notification = this.googleIapService.decodePubSubMessage(
      body as { message?: { data?: string } },
    );
    if (!notification) {
      throw new BadRequestException('Invalid Pub/Sub message');
    }

    const subNotification = notification.subscriptionNotification as
      | Record<string, unknown>
      | undefined;
    if (!subNotification?.purchaseToken) {
      return { received: true };
    }

    const purchaseToken = subNotification.purchaseToken as string;
    const subscription = await this.subscriptionModel.findOne({
      purchaseToken,
    });
    if (!subscription?.productId) {
      return { received: true };
    }

    try {
      const verified = await this.googleIapService.verifyPurchase({
        purchaseToken,
        productId: subscription.productId,
      });

      subscription.status = this.entitlementStatusToDbStatus(verified.status);
      subscription.currentPeriodEnd = verified.expiryDate;
      subscription.autoRenewing = verified.autoRenewing;
      subscription.rawPayload = verified.rawPayload;
      subscription.updated_at = new Date();
      await subscription.save();

      const productConfig = IAP_PRODUCT_MAP[subscription.productId];
      if (
        productConfig &&
        ACTIVE_ENTITLEMENT_STATUSES.includes(verified.status)
      ) {
        await this.grantEntitlement(
          subscription.userId.toString(),
          productConfig.role,
        );
      } else {
        await this.revokeEntitlementIfNoActive(subscription.userId.toString());
      }
    } catch {
      // Acknowledge webhook even if verification fails temporarily
    }

    return { received: true };
  }

  private async validateWithStore(
    dto:
      | VerifySubscriptionDto
      | (RestorePurchaseItemDto & { platform: IapPlatform }),
  ): Promise<VerifiedPurchase> {
    try {
      if (dto.platform === IapPlatform.IOS) {
        return await this.appleIapService.verifyPurchase({
          signedTransaction: (dto as VerifySubscriptionDto).signedTransaction,
          transactionId: dto.transactionId,
          receiptData: (dto as VerifySubscriptionDto).receiptData,
          productId: dto.productId,
        });
      }

      if (!dto.purchaseToken) {
        throw new BadRequestException('purchaseToken is required for Android');
      }

      return await this.googleIapService.verifyPurchase({
        purchaseToken: dto.purchaseToken,
        productId: dto.productId,
        packageName: (dto as VerifySubscriptionDto).packageName,
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new BadRequestException('Purchase could not be verified');
    }
  }

  private async upsertIapSubscription(params: {
    userId: string;
    source: SubscriptionSource;
    platform: SubscriptionPlatform;
    productConfig: (typeof IAP_PRODUCT_MAP)[string];
    verified: VerifiedPurchase;
  }): Promise<Subscription> {
    const { userId, source, platform, productConfig, verified } = params;
    const status = this.entitlementStatusToDbStatus(verified.status);
    const now = new Date();
    const periodStart = new Date(
      verified.expiryDate.getTime() - 30 * 24 * 60 * 60 * 1000,
    );

    const update = {
      userId: new mongoose.Types.ObjectId(userId),
      source,
      platform,
      productId: verified.productId,
      plan: productConfig.plan,
      status,
      transactionId: verified.transactionId,
      originalTransactionId: verified.originalTransactionId,
      purchaseToken: verified.purchaseToken,
      currentPeriodStart: periodStart,
      currentPeriodEnd: verified.expiryDate,
      trialEnd: verified.trialEndsAt,
      autoRenewing: verified.autoRenewing,
      rawPayload: verified.rawPayload,
      updated_at: now,
    };

    const filter = this.resolveIapUpsertFilter(platform, verified);

    const subscription = await this.subscriptionModel.findOneAndUpdate(
      filter,
      { $set: update, $setOnInsert: { created_at: now } },
      { upsert: true, new: true },
    );

    return subscription;
  }

  private async findExistingIosSubscription(
    dto: Pick<VerifySubscriptionDto, 'transactionId' | 'originalTransactionId'>,
  ): Promise<Subscription | null> {
    const byTransactionId = await this.subscriptionModel.findOne({
      transactionId: dto.transactionId,
      platform: SubscriptionPlatform.IOS,
    });
    if (byTransactionId) return byTransactionId;

    if (dto.originalTransactionId) {
      return this.subscriptionModel.findOne({
        originalTransactionId: dto.originalTransactionId,
      });
    }

    return null;
  }

  private async assertIosPurchaseAvailable(
    userId: string,
    verified: VerifiedPurchase,
  ): Promise<void> {
    if (!verified.originalTransactionId) return;

    const existing = await this.subscriptionModel.findOne({
      originalTransactionId: verified.originalTransactionId,
    });

    if (existing && existing.userId.toString() !== userId) {
      throw new BadRequestException(
        'Purchase already linked to another account',
      );
    }
  }

  private resolveIapUpsertFilter(
    platform: SubscriptionPlatform,
    verified: VerifiedPurchase,
  ): Record<string, unknown> {
    if (platform === SubscriptionPlatform.ANDROID && verified.purchaseToken) {
      return { purchaseToken: verified.purchaseToken };
    }

    if (
      platform === SubscriptionPlatform.IOS &&
      verified.originalTransactionId
    ) {
      return { originalTransactionId: verified.originalTransactionId };
    }

    return { transactionId: verified.transactionId, platform };
  }

  private async returnIdempotentVerify(userId: string, existing: Subscription) {
    if (existing.userId.toString() !== userId) {
      throw new BadRequestException(
        'Purchase already linked to another account',
      );
    }
    const entitlement = await this.buildEntitlementFromSubscription(existing);
    const user = await this.usersService.findOne(userId);
    return this.wrapVerifyResponse(entitlement, user);
  }

  private async grantEntitlement(userId: string, role: Role) {
    await this.userModel.findByIdAndUpdate(userId, {
      role,
      grantRole: GrantRole.host,
      hasActiveSubscription: true,
    });
  }

  private async revokeEntitlementIfNoActive(userId: string) {
    const entitlement = await this.resolveBestEntitlement(userId);
    if (entitlement.isActive) return;

    await this.userModel.findByIdAndUpdate(userId, {
      hasActiveSubscription: false,
      role: Role.member,
      grantRole: GrantRole.member,
    });
  }

  async resolveBestEntitlement(
    userId: string,
  ): Promise<SubscriptionEntitlement> {
    const subscriptions = await this.subscriptionModel.find({
      userId: new mongoose.Types.ObjectId(userId),
    });

    let best: {
      sub: Subscription;
      tier: EntitlementTier;
      entitlement: SubscriptionEntitlement;
    } | null = null;

    for (const sub of subscriptions) {
      const entitlement = await this.buildEntitlementFromSubscription(sub);
      if (!entitlement.isActive) continue;

      if (!best || TIER_PRIORITY[entitlement.tier] > TIER_PRIORITY[best.tier]) {
        best = { sub, tier: entitlement.tier, entitlement };
      }
    }

    if (best) return best.entitlement;

    return {
      isActive: false,
      hasActiveSubscription: false,
      tier: 'basic',
      source: 'none',
      status: 'none',
      managedByStore: false,
    };
  }

  private async buildEntitlementFromSubscription(
    sub: Subscription,
  ): Promise<SubscriptionEntitlement> {
    const source = this.mapSource(sub.source);
    const status = this.mapDbStatusToEntitlement(
      sub.status,
      sub.currentPeriodEnd,
    );
    const tier = sub.plan === SubscriptionPlan.PREMIUM ? 'premium' : 'standard';
    const isActive = ACTIVE_ENTITLEMENT_STATUSES.includes(status);

    return {
      isActive,
      hasActiveSubscription: isActive,
      tier: isActive ? tier : 'basic',
      source,
      status,
      productId: sub.productId,
      platform: sub.platform as SubscriptionEntitlement['platform'],
      transactionId: sub.transactionId,
      originalTransactionId: sub.originalTransactionId,
      expiryDate: sub.currentPeriodEnd?.toISOString(),
      trialEndsAt: sub.trialEnd?.toISOString(),
      autoRenewing: sub.autoRenewing,
      cancelledAt: sub.cancelledAt?.toISOString(),
      managedByStore:
        sub.source === SubscriptionSource.APPLE ||
        sub.source === SubscriptionSource.GOOGLE,
    };
  }

  private mapSource(source?: SubscriptionSource): EntitlementSource {
    switch (source) {
      case SubscriptionSource.APPLE:
        return 'apple';
      case SubscriptionSource.GOOGLE:
        return 'google';
      case SubscriptionSource.STRIPE:
        return 'stripe';
      default:
        return 'stripe';
    }
  }

  private mapDbStatusToEntitlement(
    status: SubscriptionStatus,
    expiryDate?: Date,
  ): EntitlementStatus {
    switch (status) {
      case SubscriptionStatus.ACTIVE:
        return 'active';
      case SubscriptionStatus.TRIALING:
        return 'trialing';
      case SubscriptionStatus.GRACE_PERIOD:
      case SubscriptionStatus.PAST_DUE:
        return 'grace_period';
      case SubscriptionStatus.CANCELED:
        return expiryDate && expiryDate.getTime() > Date.now()
          ? 'cancelled'
          : 'expired';
      case SubscriptionStatus.EXPIRED:
        return 'expired';
      case SubscriptionStatus.REFUNDED:
        return 'refunded';
      case SubscriptionStatus.PAUSED:
        return 'paused';
      default:
        if (expiryDate && expiryDate.getTime() < Date.now()) {
          return 'expired';
        }
        return 'none';
    }
  }

  private entitlementStatusToDbStatus(
    status: EntitlementStatus,
  ): SubscriptionStatus {
    switch (status) {
      case 'active':
        return SubscriptionStatus.ACTIVE;
      case 'trialing':
        return SubscriptionStatus.TRIALING;
      case 'grace_period':
        return SubscriptionStatus.GRACE_PERIOD;
      case 'cancelled':
        return SubscriptionStatus.CANCELED;
      case 'expired':
        return SubscriptionStatus.EXPIRED;
      case 'refunded':
        return SubscriptionStatus.REFUNDED;
      case 'paused':
        return SubscriptionStatus.PAUSED;
      default:
        return SubscriptionStatus.EXPIRED;
    }
  }

  private async syncUserFromEntitlement(
    userId: string,
    entitlement: SubscriptionEntitlement,
    user: User,
  ) {
    const shouldBeActive = entitlement.isActive;
    const targetRole = this.roleForTier(entitlement.tier);

    const needsSync =
      user.hasActiveSubscription !== shouldBeActive ||
      (shouldBeActive &&
        user.role === Role.member &&
        (targetRole === Role.standardMember ||
          targetRole === Role.premiumMember)) ||
      (!shouldBeActive &&
        (user.role === Role.standardMember ||
          user.role === Role.premiumMember));

    if (!needsSync) return;

    if (shouldBeActive) {
      await this.userModel.findByIdAndUpdate(userId, {
        hasActiveSubscription: true,
        role: targetRole,
        grantRole: GrantRole.host,
      });
    } else if (!user.isLifetimeHost) {
      await this.userModel.findByIdAndUpdate(userId, {
        hasActiveSubscription: false,
        role: Role.member,
        grantRole: GrantRole.member,
      });
    }
  }

  private roleForTier(tier: EntitlementTier): Role {
    if (tier === 'premium') return Role.premiumMember;
    if (tier === 'standard') return Role.standardMember;
    return Role.member;
  }

  private async applyStoreUpdate(params: {
    source: SubscriptionSource;
    platform: SubscriptionPlatform;
    productId?: string;
    transactionId?: string;
    originalTransactionId?: string;
    expiryDate?: Date;
    notificationType?: string;
    rawPayload: Record<string, unknown>;
  }) {
    const {
      source,
      platform,
      productId,
      transactionId,
      originalTransactionId,
      expiryDate,
      notificationType,
      rawPayload,
    } = params;

    if (!transactionId || !productId) return;

    const productConfig = IAP_PRODUCT_MAP[productId];
    if (!productConfig) return;

    let status = SubscriptionStatus.ACTIVE;
    let cancelledAt: Date | undefined;

    switch (notificationType) {
      case 'EXPIRED':
        status = SubscriptionStatus.EXPIRED;
        break;
      case 'REFUND':
        status = SubscriptionStatus.REFUNDED;
        break;
      case 'GRACE_PERIOD':
        status = SubscriptionStatus.GRACE_PERIOD;
        break;
      case 'DID_CHANGE_RENEWAL_STATUS':
        status = SubscriptionStatus.CANCELED;
        cancelledAt = new Date();
        break;
      case 'SUBSCRIBED':
      case 'DID_RENEW':
      default:
        status = SubscriptionStatus.ACTIVE;
    }

    const filter = originalTransactionId
      ? { originalTransactionId }
      : { transactionId, platform };

    const subscription = await this.subscriptionModel.findOneAndUpdate(
      filter,
      {
        $set: {
          source,
          platform,
          productId,
          plan: productConfig.plan,
          status,
          transactionId,
          originalTransactionId,
          currentPeriodEnd: expiryDate,
          cancelledAt,
          rawPayload,
          updated_at: new Date(),
        },
      },
      { new: true },
    );

    if (!subscription) return;

    if (
      ACTIVE_ENTITLEMENT_STATUSES.includes(
        this.mapDbStatusToEntitlement(status, expiryDate),
      )
    ) {
      await this.grantEntitlement(
        subscription.userId.toString(),
        productConfig.role,
      );
    } else {
      await this.revokeEntitlementIfNoActive(subscription.userId.toString());
    }
  }

  private wrapVerifyResponse(
    entitlement: SubscriptionEntitlement,
    user: unknown,
  ) {
    return {
      statusCode: 200,
      message: 'Subscription verified',
      data: { entitlement, user },
    };
  }

  private wrapMeResponse(entitlement: SubscriptionEntitlement) {
    return {
      statusCode: 200,
      data: entitlement,
    };
  }
}
