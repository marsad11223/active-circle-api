import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export enum OutboxStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  PROCESSED = 'PROCESSED',
  FAILED = 'FAILED',
}

@Schema({ _id: false, versionKey: false })
export class EmailTemplatePayload {
  @Prop({ required: true })
  templateId: string;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  data: Record<string, unknown>;
}

const EmailTemplatePayloadSchema =
  SchemaFactory.createForClass(EmailTemplatePayload);

@Schema({
  collection: 'outbox_events',
  versionKey: false,
  timestamps: { createdAt: true, updatedAt: false },
})
export class OutboxEvent extends Document {
  @Prop({ required: true })
  type: string;

  @Prop({ type: Types.ObjectId, required: true })
  entityId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  payload: Record<string, unknown>;

  @Prop({ type: [String], default: [] })
  recipientTokens: string[];

  @Prop({ type: String, default: null })
  recipientEmail: string | null;

  @Prop({ type: EmailTemplatePayloadSchema, default: null })
  emailTemplate: EmailTemplatePayload | null;

  @Prop({ required: true })
  idempotencyKey: string;

  @Prop({
    required: true,
    enum: OutboxStatus,
    default: OutboxStatus.PENDING,
  })
  status: OutboxStatus;

  @Prop({ required: true, default: 0 })
  attempts: number;

  @Prop({ required: true, default: 3 })
  maxAttempts: number;

  @Prop({ type: Date, default: null })
  nextRetryAt: Date | null;

  @Prop({ type: Date, default: null })
  processedAt: Date | null;

  @Prop({ type: String, default: null })
  lastError: string | null;

  @Prop({ type: Date, default: null })
  lockedAt: Date | null;

  createdAt: Date;
}

export const OutboxEventSchema = SchemaFactory.createForClass(OutboxEvent);

OutboxEventSchema.index(
  { status: 1, nextRetryAt: 1, createdAt: 1 },
  { name: 'outbox_status_retry_created_idx' },
);
OutboxEventSchema.index({ idempotencyKey: 1 }, { unique: true });
OutboxEventSchema.index(
  { processedAt: 1 },
  {
    expireAfterSeconds: 30 * 24 * 60 * 60,
    partialFilterExpression: { processedAt: { $type: 'date' } },
  },
);
