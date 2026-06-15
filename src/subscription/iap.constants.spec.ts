import {
  ACTIVE_ENTITLEMENT_STATUSES,
  IAP_PRODUCT_MAP,
  TIER_PRIORITY,
} from './iap.constants';
import { SubscriptionPlan } from '../schemas/subscription.schema';
import { Role } from '../schemas/user.schema';

describe('IAP_PRODUCT_MAP', () => {
  it('maps iOS and Android product IDs to the correct roles', () => {
    expect(IAP_PRODUCT_MAP['com.theactivecircle.app.standard.monthly']).toEqual({
      tier: 'standard',
      plan: SubscriptionPlan.STANDARD,
      role: Role.standardMember,
    });
    expect(IAP_PRODUCT_MAP['standard_monthly']).toEqual({
      tier: 'standard',
      plan: SubscriptionPlan.STANDARD,
      role: Role.standardMember,
    });
    expect(IAP_PRODUCT_MAP['com.theactivecircle.app.premium.monthly']).toEqual({
      tier: 'premium',
      plan: SubscriptionPlan.PREMIUM,
      role: Role.premiumMember,
    });
    expect(IAP_PRODUCT_MAP['premium_monthly']).toEqual({
      tier: 'premium',
      plan: SubscriptionPlan.PREMIUM,
      role: Role.premiumMember,
    });
  });
});

describe('TIER_PRIORITY', () => {
  it('ranks premium above standard above basic', () => {
    expect(TIER_PRIORITY.premium).toBeGreaterThan(TIER_PRIORITY.standard);
    expect(TIER_PRIORITY.standard).toBeGreaterThan(TIER_PRIORITY.basic);
  });
});

describe('ACTIVE_ENTITLEMENT_STATUSES', () => {
  it('includes active, trialing, and grace_period', () => {
    expect(ACTIVE_ENTITLEMENT_STATUSES).toEqual(
      expect.arrayContaining(['active', 'trialing', 'grace_period']),
    );
  });
});
