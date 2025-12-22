import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

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
  role: Role;

  @Prop({ required: false })
  lastRole?: Role; // Track last role used (member/host) for profile restoration

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
}

export const UserSchema = SchemaFactory.createForClass(User);
