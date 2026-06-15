import { Role } from '../schemas/user.schema';
import { SubscriptionPlan } from '../schemas/subscription.schema';

export type EntitlementTier = 'basic' | 'standard' | 'premium';
export type EntitlementSource = 'none' | 'stripe' | 'apple' | 'google';
export type EntitlementPlatform = 'ios' | 'android' | 'web';
export type EntitlementStatus =
  | 'none'
  | 'active'
  | 'trialing'
  | 'grace_period'
  | 'cancelled'
  | 'expired'
  | 'refunded'
  | 'paused';

export interface ProductConfig {
  tier: EntitlementTier;
  plan: SubscriptionPlan;
  role: Role;
}

export const IAP_PRODUCT_MAP: Record<string, ProductConfig> = {
  'com.theactivecircle.app.standard.monthly': {
    tier: 'standard',
    plan: SubscriptionPlan.STANDARD,
    role: Role.standardMember,
  },
  standard_monthly: {
    tier: 'standard',
    plan: SubscriptionPlan.STANDARD,
    role: Role.standardMember,
  },
  'com.theactivecircle.app.premium.monthly': {
    tier: 'premium',
    plan: SubscriptionPlan.PREMIUM,
    role: Role.premiumMember,
  },
  premium_monthly: {
    tier: 'premium',
    plan: SubscriptionPlan.PREMIUM,
    role: Role.premiumMember,
  },
};

export const TIER_PRIORITY: Record<EntitlementTier, number> = {
  basic: 0,
  standard: 1,
  premium: 2,
};

export const ACTIVE_ENTITLEMENT_STATUSES: EntitlementStatus[] = [
  'active',
  'trialing',
  'grace_period',
];

export interface SubscriptionEntitlement {
  isActive: boolean;
  hasActiveSubscription: boolean;
  tier: EntitlementTier;
  source: EntitlementSource;
  status: EntitlementStatus;
  productId?: string;
  platform?: EntitlementPlatform;
  transactionId?: string;
  originalTransactionId?: string;
  expiryDate?: string;
  trialEndsAt?: string;
  autoRenewing?: boolean;
  cancelledAt?: string;
  managedByStore: boolean;
}

export interface VerifiedPurchase {
  productId: string;
  transactionId: string;
  originalTransactionId?: string;
  purchaseToken?: string;
  expiryDate: Date;
  trialEndsAt?: Date;
  autoRenewing: boolean;
  status: EntitlementStatus;
  rawPayload: Record<string, unknown>;
}
