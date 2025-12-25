import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum RecurringType {
  ONE_TIME = 'one-time',
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
}

@Schema()
export class Activity extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  hostId: Types.ObjectId; // Host who created the activity

  @Prop({ required: true })
  title: string; // Activity title

  @Prop({ required: true })
  description: string; // Activity description

  @Prop({ type: [String], required: true })
  category: string[]; // Activity categories (array of strings)

  @Prop({ required: true })
  location: string; // Activity location

  @Prop({ required: true })
  date: Date; // Activity date

  @Prop({ required: true })
  time: string; // Activity time (e.g., "14:00" or "2:00 PM")

  @Prop({ required: true, min: 1 })
  maxParticipants: number; // Maximum number of participants

  @Prop({ required: false, default: 0 })
  price?: number; // Price (0 or empty means free)

  @Prop({
    enum: RecurringType,
    default: RecurringType.ONE_TIME,
  })
  recurring: RecurringType; // Recurring option

  @Prop({ required: false })
  additionalInformation?: string; // Additional details (equipment, what to bring, etc.)

  @Prop({ required: true })
  picture: string; // Picture URL to display

  @Prop({ default: Date.now })
  created_at: Date;

  @Prop({ default: Date.now })
  updated_at: Date;

  @Prop({ default: null })
  deleted_at: Date;
}

export const ActivitySchema = SchemaFactory.createForClass(Activity);
