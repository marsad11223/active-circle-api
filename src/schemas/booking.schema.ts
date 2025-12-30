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

export enum AttendanceStatus {
  PENDING = 'pending', // Not marked yet
  PRESENT = 'present',
  ABSENT = 'absent',
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
    type: String,
    enum: PaymentStatus,
    required: false, // Optional - null for free activities
    default: null, // Changed: null default instead of PENDING
  })
  paymentStatus?: PaymentStatus | null; // Payment status (null for free activities)

  @Prop({ required: false })
  paymentIntentId?: string; // Stripe Payment Intent ID

  @Prop({ required: false })
  stripeChargeId?: string; // Stripe Charge ID

  @Prop({ required: false })
  stripeRefundId?: string; // Stripe Refund ID (if declined)

  @Prop({ required: false })
  stripeTransferId?: string; // Stripe Transfer ID (when sent to host)

  @Prop({ required: false })
  invoiceNumber?: string; // Invoice number (e.g., INV-2024-001)

  @Prop({ required: false })
  declineReason?: string; // Reason if declined by host

  @Prop({
    type: String,
    enum: AttendanceStatus,
    required: false,
    default: AttendanceStatus.PENDING,
  })
  attendanceStatus?: AttendanceStatus; // Attendance status (pending/present/absent)

  @Prop({ default: Date.now })
  created_at: Date;

  @Prop({ default: Date.now })
  updated_at: Date;

  @Prop({ default: null })
  deleted_at: Date;
}

export const BookingSchema = SchemaFactory.createForClass(Booking);
