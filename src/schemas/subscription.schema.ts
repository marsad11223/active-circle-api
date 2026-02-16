import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum SubscriptionStatus {
  ACTIVE = 'active',
  PAST_DUE = 'past_due',
  CANCELED = 'canceled',
  UNPAID = 'unpaid',
  INCOMPLETE = 'incomplete',
  TRIALING = 'trialing',
}

export enum SubscriptionPlan {
  PREMIUM = 'premium', // Full host: £5.99/month, unlimited activities
  STANDARD = 'standard', // Standard: £1.99/month, 2 free + 1 paid per period, 3-month trial
}

@Schema()
export class Subscription extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  stripeCustomerId: string;

  @Prop({ required: true })
  stripeSubscriptionId: string;

  @Prop()
  stripePriceId: string;

  @Prop({ enum: SubscriptionPlan, default: SubscriptionPlan.PREMIUM })
  plan: SubscriptionPlan;

  @Prop({ enum: SubscriptionStatus, default: SubscriptionStatus.INCOMPLETE })
  status: SubscriptionStatus;

  @Prop()
  currentPeriodStart: Date;

  @Prop()
  currentPeriodEnd: Date;

  @Prop({ default: false })
  cancelAtPeriodEnd: boolean;

  @Prop()
  trialStart: Date;

  @Prop()
  trialEnd: Date;

  @Prop({ default: Date.now })
  created_at: Date;

  @Prop({ default: Date.now })
  updated_at: Date;
}

export const SubscriptionSchema = SchemaFactory.createForClass(Subscription);
