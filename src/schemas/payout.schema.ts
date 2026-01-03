import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum PayoutStatus {
  PENDING = 'pending', // Waiting for admin approval
  APPROVED = 'approved', // Admin approved, payment processing
  COMPLETED = 'completed', // Payment successfully sent
  REJECTED = 'rejected', // Admin rejected the request
  FAILED = 'failed', // Payment transfer failed
}

@Schema()
export class Payout extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  hostId: Types.ObjectId; // Host requesting payout

  @Prop({ required: true, min: 0.01 })
  requestedAmount: number; // Amount requested by host

  @Prop({ required: false, min: 0 })
  stripeFee?: number; // Stripe fee deducted

  @Prop({ required: false, min: 0 })
  netAmount?: number; // Final amount after fees (requestedAmount - stripeFee)

  @Prop({
    enum: PayoutStatus,
    default: PayoutStatus.PENDING,
  })
  status: PayoutStatus; // Payout status

  @Prop({ required: false })
  stripeTransferId?: string; // Stripe Transfer ID (when payment is sent)

  @Prop({ required: false })
  stripePayoutId?: string; // Stripe Payout ID (if using Stripe Connect)

  @Prop({ required: false })
  paymentMethodId?: string; // Payment method ID (Stripe account/bank account)

  @Prop({ required: false })
  rejectionReason?: string; // Reason if rejected by admin

  @Prop({ required: false })
  failureReason?: string; // Reason if payment failed

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Booking' }], default: [] })
  relatedBookings?: Types.ObjectId[]; // Bookings included in this payout

  @Prop({ type: Types.ObjectId, ref: 'User', required: false })
  approvedBy?: Types.ObjectId; // Admin who approved/rejected

  @Prop({ default: Date.now })
  requestedAt: Date; // When host requested

  @Prop({ required: false })
  approvedAt?: Date; // When admin approved

  @Prop({ required: false })
  completedAt?: Date; // When payment was completed

  @Prop({ default: Date.now })
  created_at: Date;

  @Prop({ default: Date.now })
  updated_at: Date;

  @Prop({ default: null })
  deleted_at: Date;
}

export const PayoutSchema = SchemaFactory.createForClass(Payout);

