import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum SubscriptionStatus {
  ACTIVE = 'active',
  PAST_DUE = 'past_due',
  CANCELED = 'canceled',
  UNPAID = 'unpaid',
  INCOMPLETE = 'incomplete',
  TRIALING = 'trialing',
  GRACE_PERIOD = 'grace_period',
  EXPIRED = 'expired',
  REFUNDED = 'refunded',
  PAUSED = 'paused',
}

export enum SubscriptionPlan {
  PREMIUM = 'premium',
  STANDARD = 'standard',
}

export enum SubscriptionSource {
  STRIPE = 'stripe',
  APPLE = 'apple',
  GOOGLE = 'google',
}

export enum SubscriptionPlatform {
  IOS = 'ios',
  ANDROID = 'android',
  WEB = 'web',
}

@Schema()
export class Subscription extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ enum: SubscriptionSource, default: SubscriptionSource.STRIPE })
  source: SubscriptionSource;

  @Prop({ enum: SubscriptionPlatform })
  platform?: SubscriptionPlatform;

  @Prop()
  stripeCustomerId?: string;

  @Prop()
  stripeSubscriptionId?: string;

  @Prop()
  stripePriceId?: string;

  @Prop()
  productId?: string;

  @Prop({ enum: SubscriptionPlan, default: SubscriptionPlan.PREMIUM })
  plan: SubscriptionPlan;

  @Prop({ enum: SubscriptionStatus, default: SubscriptionStatus.INCOMPLETE })
  status: SubscriptionStatus;

  @Prop()
  transactionId?: string;

  @Prop()
  originalTransactionId?: string;

  @Prop()
  purchaseToken?: string;

  @Prop()
  currentPeriodStart?: Date;

  @Prop()
  currentPeriodEnd?: Date;

  @Prop({ default: false })
  cancelAtPeriodEnd: boolean;

  @Prop()
  trialStart?: Date;

  @Prop()
  trialEnd?: Date;

  @Prop()
  autoRenewing?: boolean;

  @Prop()
  cancelledAt?: Date;

  @Prop({ type: Object })
  rawPayload?: Record<string, unknown>;

  @Prop({ default: Date.now })
  created_at: Date;

  @Prop({ default: Date.now })
  updated_at: Date;
}

export const SubscriptionSchema = SchemaFactory.createForClass(Subscription);

SubscriptionSchema.index({ userId: 1, status: 1 });
SubscriptionSchema.index(
  { originalTransactionId: 1 },
  { unique: true, sparse: true },
);
SubscriptionSchema.index({ purchaseToken: 1 }, { unique: true, sparse: true });
SubscriptionSchema.index({ transactionId: 1, platform: 1 }, { unique: true });
