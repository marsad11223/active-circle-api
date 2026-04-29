import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({
  collection: 'notification_tokens',
  versionKey: false,
})
export class NotificationToken extends Document {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true, unique: true, index: true })
  token: string;

  @Prop({ default: Date.now })
  createdAt: Date;
}

export const NotificationTokenSchema =
  SchemaFactory.createForClass(NotificationToken);
