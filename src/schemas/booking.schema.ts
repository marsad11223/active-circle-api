import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum BookingStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  CANCELLED = 'cancelled',
}

export enum PaymentStatus {
  PENDING = 'pending',
  PAID = 'paid',
  REFUNDED = 'refunded',
  TRANSFERRED = 'transferred', // Transferred to host
}

@Schema()
export class Booking extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  memberId: Types.ObjectId; // Member who booked

  @Prop({ type: Types.ObjectId, ref: 'Activity', required: true })
  activityId: Types.ObjectId; // Activity being booked

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  hostId: Types.ObjectId; // Host who created the activity

  @Prop({
    enum: BookingStatus,
    default: BookingStatus.PENDING,
  })
  status: BookingStatus; // Booking status

  @Prop({ required: true, min: 0 })
  amount: number; // Booking amount (0 for free activities)

  @Prop({
    enum: PaymentStatus,
    default: PaymentStatus.PENDING,
  })
  paymentStatus: PaymentStatus; // Payment status

  @Prop({ required: false })
  paymentIntentId?: string; // Stripe Payment Intent ID

  @Prop({ required: false })
  stripeChargeId?: string; // Stripe Charge ID

  @Prop({ required: false })
  stripeRefundId?: string; // Stripe Refund ID (if declined)

  @Prop({ required: false })
  stripeTransferId?: string; // Stripe Transfer ID (when sent to host)

  @Prop({ required: false })
  declineReason?: string; // Reason if declined by host

  @Prop({ default: Date.now })
  created_at: Date;

  @Prop({ default: Date.now })
  updated_at: Date;

  @Prop({ default: null })
  deleted_at: Date;
}

export const BookingSchema = SchemaFactory.createForClass(Booking);

