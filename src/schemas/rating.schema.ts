import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema()
export class Rating extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  memberId: Types.ObjectId; // Member who gave the rating

  @Prop({ type: Types.ObjectId, ref: 'Activity', required: true })
  activityId: Types.ObjectId; // Activity being rated

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  hostId: Types.ObjectId; // Host of the activity

  @Prop({ type: Types.ObjectId, ref: 'Booking', required: true })
  bookingId: Types.ObjectId; // Booking associated with this rating

  @Prop({ required: true, min: 1, max: 5 })
  rating: number; // Rating from 1 to 5 stars

  @Prop({ required: false })
  review?: string; // Optional review text

  @Prop({ required: false })
  hostReply?: string; // Host's reply to the review

  @Prop({ required: false })
  hostReplyDate?: Date; // Date when host replied

  @Prop({ default: Date.now })
  created_at: Date;

  @Prop({ default: Date.now })
  updated_at: Date;

  @Prop({ default: null })
  deleted_at: Date;
}

export const RatingSchema = SchemaFactory.createForClass(Rating);

// Create compound index to ensure one rating per booking
RatingSchema.index({ bookingId: 1 }, { unique: true });

