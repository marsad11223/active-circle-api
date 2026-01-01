import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import * as mongoose from 'mongoose';

export enum Role {
  member = 'member',
  host = 'host',
  superAdmin = 'superAdmin',
}

@Schema()
export class User {
  @Prop()
  name: string;

  @Prop({ required: false })
  firstName?: string;

  @Prop({ required: false })
  lastName?: string;

  @Prop()
  email: string;

  @Prop()
  password: string;

  @Prop({ default: Role.member })
  role: Role; // Permanent role - set to 'host' if user has paid, cannot be changed directly

  @Prop({ required: false })
  lastRole?: Role; // DEPRECATED: Legacy field for backward compatibility. Use grantRole instead.

  @Prop({ required: false })
  grantRole?: Role; // Current selected role (member/host) - can be toggled. Also serves as "last role" for restoration.

  @Prop({ required: false })
  lastLogin?: Date; // Tracks when user last logged in with current grantRole

  @Prop()
  address: string;

  @Prop({ required: false })
  phoneNumber?: string;

  @Prop({ required: false })
  profilePhoto?: string;

  // Notification Preferences
  @Prop({ default: true })
  emailNotifications: boolean;

  @Prop({ default: true })
  marketingEmails: boolean;

  @Prop({ default: true })
  activityUpdates: boolean;

  @Prop({ default: true })
  bookingNotifications: boolean;

  @Prop({ default: true })
  paymentNotifications: boolean;

  @Prop({ default: Date.now })
  created_at: Date;

  @Prop({ default: Date.now })
  updated_at: Date;

  @Prop({ default: null })
  deleted_at: Date;

  @Prop()
  stripeCustomerId: string;

  @Prop({ default: false })
  hasActiveSubscription: boolean;

  // Member profile specific fields
  @Prop({ type: [String], default: [] })
  interests: string[]; // Array of activity interests (only for members)

  @Prop({ default: 10 })
  radius: number; // Search radius in km for activities (default 10km, only for members)

  @Prop({
    type: [{ type: mongoose.Types.ObjectId, ref: 'Activity' }],
    default: [],
  })
  favoriteActivities?: mongoose.Types.ObjectId[]; // Array of favorite activity IDs (only for members)
}

export const UserSchema = SchemaFactory.createForClass(User);
