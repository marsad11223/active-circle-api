import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum MessageType {
  INQUIRY = 'inquiry', // Member asking host
  REPLY = 'reply', // Host replying to member
  BROADCAST = 'broadcast', // Host broadcasting to all members
}

export enum BroadcastType {
  REMINDER = 'reminder',
  EVENT_CANCEL = 'event_cancel',
  GENERAL_INFO = 'general_info',
}

@Schema()
export class Message extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  senderId: Types.ObjectId; // Who sent the message

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  receiverId: Types.ObjectId; // Who receives the message

  @Prop({ type: Types.ObjectId, ref: 'Activity', required: false })
  activityId?: Types.ObjectId; // Related activity (for inquiry/reply/broadcast)

  @Prop({ type: Types.ObjectId, ref: 'Message', required: false })
  parentMessageId?: Types.ObjectId; // For replies - links to original message

  @Prop({ enum: MessageType, required: true })
  messageType: MessageType; // Type of message

  @Prop({ enum: BroadcastType, required: false })
  broadcastType?: BroadcastType; // Type of broadcast (if messageType is broadcast)

  @Prop({ required: true })
  subject: string; // Message subject

  @Prop({ required: true })
  content: string; // Message content

  @Prop({ default: false })
  isSeen: boolean; // Whether receiver has seen the message

  @Prop({ default: null })
  seenAt?: Date; // When message was seen

  @Prop({ default: false })
  isEmailSent: boolean; // Whether email was sent (for tracking)

  @Prop({ default: Date.now })
  created_at: Date;

  @Prop({ default: Date.now })
  updated_at: Date;

  @Prop({ default: null })
  deleted_at: Date;
}

export const MessageSchema = SchemaFactory.createForClass(Message);

// Indexes for efficient queries
MessageSchema.index({ receiverId: 1, isSeen: 1 });
MessageSchema.index({ senderId: 1 });
MessageSchema.index({ activityId: 1 });
MessageSchema.index({ parentMessageId: 1 });

