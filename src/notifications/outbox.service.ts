import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import mongoose, { ClientSession, Model, Types } from 'mongoose';
import { OutboxEvent, OutboxStatus } from 'src/schemas/outbox-event.schema';
import { NotificationPayload } from './notification-payload.util';

export type EnqueueOutboxInput = {
  type: string;
  entityId: string | Types.ObjectId;
  payload: {
    type: string;
    screen: string;
    entityId: string;
    params: Record<string, string>;
    sentAt: string;
  };
  recipientTokens: string[];
  recipientEmail: string | null;
  emailTemplate: { templateId: string; data: Record<string, unknown> } | null;
  idempotencyKey: string;
  maxAttempts?: number;
};

export type EnqueueOutboxEvent = {
  type: string;
  entityId: string;
  recipientUserId: string;
  recipientTokens: string[];
  recipientEmail?: string;
  payload: NotificationPayload;
  emailTemplate?: { templateId: string; data: Record<string, unknown> };
  idempotencyKey?: string;
  maxAttempts?: number;
};

@Injectable()
export class OutboxService {
  constructor(
    @InjectModel(OutboxEvent.name)
    private readonly outboxEventModel: Model<OutboxEvent>,
  ) {}

  async enqueue(
    session: ClientSession | null,
    event: EnqueueOutboxEvent,
  ): Promise<OutboxEvent | null>;
  async enqueue(
    input: EnqueueOutboxInput,
    session?: ClientSession,
  ): Promise<OutboxEvent | null>;
  async enqueue(
    arg1: EnqueueOutboxInput | ClientSession | null,
    arg2?: EnqueueOutboxEvent | ClientSession,
  ): Promise<OutboxEvent | null> {
    const parsed = this.normalizeEnqueueArgs(arg1, arg2);
    try {
      const [created] = await this.outboxEventModel.create(
        [
          {
            type: parsed.input.type,
            entityId:
              typeof parsed.input.entityId === 'string'
                ? mongoose.isValidObjectId(parsed.input.entityId)
                  ? new mongoose.Types.ObjectId(parsed.input.entityId)
                  : new mongoose.Types.ObjectId()
                : parsed.input.entityId,
            payload: parsed.input.payload,
            recipientTokens: parsed.input.recipientTokens,
            recipientEmail: parsed.input.recipientEmail,
            emailTemplate: parsed.input.emailTemplate,
            idempotencyKey: parsed.input.idempotencyKey,
            status: OutboxStatus.PENDING,
            attempts: 0,
            maxAttempts: parsed.input.maxAttempts ?? 3,
            nextRetryAt: null,
            processedAt: null,
            lastError: null,
            lockedAt: null,
          },
        ],
        parsed.session ? { session: parsed.session } : {},
      );
      return created;
    } catch (error: unknown) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code?: number }).code === 11000
      ) {
        return null;
      }
      throw error;
    }
  }

  private normalizeEnqueueArgs(
    arg1: EnqueueOutboxInput | ClientSession | null,
    arg2?: EnqueueOutboxEvent | ClientSession,
  ): { input: EnqueueOutboxInput; session?: ClientSession } {
    if (this.isOutboxEvent(arg2)) {
      const session = this.isClientSession(arg1) ? arg1 : undefined;
      const event = arg2;
      return {
        session,
        input: {
          type: event.type,
          entityId: event.entityId,
          payload: event.payload,
          recipientTokens: event.recipientTokens,
          recipientEmail: event.recipientEmail ?? null,
          emailTemplate: event.emailTemplate ?? null,
          idempotencyKey:
            event.idempotencyKey ??
            `${event.type}:${event.entityId}:${event.recipientUserId}`,
          maxAttempts: event.maxAttempts,
        },
      };
    }

    return {
      input: arg1 as EnqueueOutboxInput,
      session: this.isClientSession(arg2) ? arg2 : undefined,
    };
  }

  private isOutboxEvent(value: unknown): value is EnqueueOutboxEvent {
    if (!value || typeof value !== 'object') {
      return false;
    }
    const candidate = value as Record<string, unknown>;
    return (
      typeof candidate.type === 'string' &&
      typeof candidate.entityId === 'string' &&
      typeof candidate.recipientUserId === 'string' &&
      Array.isArray(candidate.recipientTokens) &&
      typeof candidate.payload === 'object'
    );
  }

  private isClientSession(value: unknown): value is ClientSession {
    return (
      typeof value === 'object' &&
      value !== null &&
      'startTransaction' in value &&
      typeof (value as { startTransaction?: unknown }).startTransaction ===
        'function'
    );
  }
}
