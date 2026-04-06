import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import * as mongoose from 'mongoose';

/** Permanent account role: member (free), standardMember (Standard plan), premiumMember (Premium plan), superAdmin */
export enum Role {
  member = 'member',
  standardMember = 'standardMember', // Standard plan: 2 free + 1 paid activity per period
  premiumMember = 'premiumMember',
  superAdmin = 'superAdmin',
}

/** Current mode for frontend: member = browsing, host = creating activities. */
export enum GrantRole {
  member = 'member',
  host = 'host',
}

export enum Gender {
  male = 'male',
  female = 'female',
  other = 'other',
}

@Schema()
export class User {
  @Prop()
  name!: string;

  @Prop({ required: false })
  firstName?: string;

  @Prop({ required: false })
  lastName?: string;

  @Prop()
  email!: string;

  @Prop()
  password!: string;

  @Prop({ default: Role.member })
  role!: Role; // Permanent role: member | standardMember | premiumMember | premiumMember | superAdmin

  @Prop({ required: false })
  lastRole?: Role; // DEPRECATED: Legacy field for backward compatibility. Use grantRole instead.

  @Prop({ required: false })
  grantRole?: GrantRole; // Current mode (member | host) for frontend - browsing vs creating.

  @Prop({ required: false })
  lastLogin?: Date; // Tracks when user last logged in with current grantRole

  @Prop()
  address?: string;

  @Prop({ required: false })
  phoneNumber?: string;

  @Prop({ required: false })
  profilePhoto?: string;

  @Prop({ required: false })
  dateOfBirth?: Date;

  @Prop({ required: false })
  gender?: string;

  // Notification Preferences
  @Prop({ default: true })
  emailNotifications!: boolean;

  @Prop({ default: true })
  marketingEmails!: boolean;

  @Prop({ default: true })
  activityUpdates!: boolean;

  @Prop({ default: true })
  bookingNotifications!: boolean;

  @Prop({ default: true })
  paymentNotifications!: boolean;

  // New unread / unseen notification flags
  @Prop({ default: false })
  hasNewBookings!: boolean; // true for hosts/admins when there's a new booking request

  @Prop({ default: false })
  hasNewMessages!: boolean; // true for hosts or members when there's a new message

  @Prop({ default: false })
  hasNewPayoutRequests!: boolean; // true for admins when a host creates a payout request

  @Prop({ default: Date.now })
  created_at!: Date;

  @Prop({ default: Date.now })
  updated_at!: Date;

  @Prop({ default: null })
  deleted_at!: Date;

  @Prop({ default: false })
  isDeleted?: boolean;

  @Prop({ default: false })
  suspended?: boolean; // Soft suspension flag (admin can suspend account)

  @Prop({ required: false })
  suspendedReason?: string;

  // Email verification (OTP) – required before subscription/trial
  @Prop({ default: false })
  emailVerified?: boolean;

  @Prop({ required: false })
  emailVerifiedAt?: Date;

  @Prop({ required: false, select: false })
  verificationOtpHash?: string;

  @Prop({ required: false })
  verificationOtpExpiresAt?: Date;

  @Prop({ default: 0 })
  verificationOtpAttempts?: number;

  @Prop({ required: false })
  verificationOtpLastSentAt?: Date;

  @Prop({ required: false })
  suspended_at?: Date;

  @Prop()
  stripeCustomerId!: string;

  @Prop({ default: false })
  hasActiveSubscription!: boolean;

  /** When true, user is a lifetime-free host (no Stripe subscription; treat as premium host). Set via DB or admin. */
  @Prop({ default: false })
  isLifetimeHost?: boolean;

  // Member profile specific fields
  @Prop({ type: [String], default: [] })
  interests!: string[]; // Array of activity interests (only for members)

  @Prop({ default: 10 })
  radius!: number; // Search radius in km for activities (default 10km, only for members)

  @Prop({
    type: [{ type: mongoose.Types.ObjectId, ref: 'Activity' }],
    default: [],
  })
  favoriteActivities?: mongoose.Types.ObjectId[]; // Array of favorite activity IDs (only for members)

  // Bank accounts for payouts (host only)
  @Prop({
    type: [
      {
        id: { type: String, required: true },
        iban: { type: String, required: false }, // Optional - either IBAN or accountNumber required
        bankName: { type: String, required: false },
        accountHolderName: { type: String, required: true },
        accountNumber: { type: String, required: false }, // Optional - either IBAN or accountNumber required
        swiftCode: { type: String, required: false }, // Optional
        routingNumber: { type: String, required: false },
        address: { type: String, required: false },
        city: { type: String, required: false },
        country: { type: String, required: false },
        postalCode: { type: String, required: false },
        isDefault: { type: Boolean, default: false },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    default: [],
    _id: false, // Disable _id for subdocuments
  })
  bankAccounts?: Array<{
    id: string;
    iban?: string; // Optional - either IBAN or accountNumber required
    bankName?: string;
    accountHolderName: string;
    accountNumber?: string; // Optional - either IBAN or accountNumber required
    swiftCode?: string; // Optional
    routingNumber?: string;
    address?: string;
    city?: string;
    country?: string;
    postalCode?: string;
    isDefault?: boolean;
    createdAt?: Date;
  }>;
}

export const UserSchema = SchemaFactory.createForClass(User);
