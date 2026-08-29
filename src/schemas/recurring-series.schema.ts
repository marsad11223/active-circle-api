import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { RecurringType } from 'src/schemas/activity.schema';

@Schema({ _id: false })
export class ScheduleRule {
  /** Luxon weekday 1–7 (Monday–Sunday); required for weekly series. */
  @Prop({ required: false, min: 1, max: 7 })
  dayOfWeek?: number;

  /** Calendar day 1–31; required for monthly series (see MONTHLY_DAY_CLAMP_POLICY in recurring-activity.ts). */
  @Prop({ required: false, min: 1, max: 31 })
  dayOfMonth?: number;

  @Prop({ required: true })
  startTime: string; // HH:mm (24-hour)

  @Prop({ required: true, min: 1 })
  durationMinutes: number;

  @Prop({ required: true })
  timezone: string; // IANA zone, e.g. Europe/London
}

export const ScheduleRuleSchema = SchemaFactory.createForClass(ScheduleRule);

@Schema({ timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } })
export class RecurringSeries extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  hostId: Types.ObjectId;

  @Prop({
    type: String,
    enum: [
      RecurringType.DAILY,
      RecurringType.WEEKLY,
      RecurringType.MONTHLY,
      RecurringType.YEARLY,
    ],
    required: true,
  })
  recurring: RecurringType;

  @Prop({ type: ScheduleRuleSchema, required: true })
  scheduleRule: ScheduleRule;

  @Prop({ type: Boolean, default: true })
  active: boolean;

  @Prop({ type: Date, default: null })
  recurrenceStoppedAt?: Date | null;

  @Prop({ required: true })
  lastOccurrenceStartDateTime: Date;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  description: string;

  @Prop({ type: [String], required: true })
  category: string[];

  @Prop({ required: true })
  location: string;

  @Prop({
    type: {
      lat: Number,
      lng: Number,
    },
    required: false,
  })
  coordinates?: { lat?: number; lng?: number };

  @Prop({ required: false })
  difficultyLevel?: string;

  @Prop({ required: true, min: 1 })
  maxParticipants: number;

  @Prop({ required: false, default: 0 })
  price?: number;

  @Prop({ required: false })
  additionalInformation?: string;

  @Prop({ required: true })
  picture: string;

  @Prop({ type: [String], default: [] })
  pictures?: string[];

  /** Set during migration so re-runs can locate the legacy root activity. */
  @Prop({ type: Types.ObjectId, ref: 'Activity', required: false })
  migratedFromRootActivityId?: Types.ObjectId;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const RecurringSeriesSchema =
  SchemaFactory.createForClass(RecurringSeries);

RecurringSeriesSchema.index({ active: 1 });
