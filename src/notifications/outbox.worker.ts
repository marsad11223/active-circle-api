import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EmailService } from 'src/email/email.service';
import { OutboxEvent, OutboxStatus } from 'src/schemas/outbox-event.schema';
import { NotificationsService } from './notifications.service';

@Injectable()
export class OutboxWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxWorker.name);
  private readonly pollIntervalMs = 10_000;
  private readonly batchSize = 20;
  private readonly staleLockMs = 30_000;
  private intervalRef: NodeJS.Timeout | null = null;
  private isPolling = false;

  constructor(
    @InjectModel(OutboxEvent.name)
    private readonly outboxEventModel: Model<OutboxEvent>,
    private readonly notificationsService: NotificationsService,
    private readonly emailService: EmailService,
  ) {}

  onModuleInit(): void {
    this.intervalRef = setInterval(() => {
      void this.poll();
    }, this.pollIntervalMs);
  }

  onModuleDestroy(): void {
    if (this.intervalRef) {
      clearInterval(this.intervalRef);
      this.intervalRef = null;
    }
  }

  private async poll(): Promise<void> {
    if (this.isPolling) {
      return;
    }
    this.isPolling = true;
    try {
      await this.reclaimStaleLocks();
      for (let i = 0; i < this.batchSize; i++) {
        const event = await this.lockNextEvent();
        if (!event) {
          break;
        }
        await this.processEvent(event);
      }
    } finally {
      this.isPolling = false;
    }
  }

  private async reclaimStaleLocks(): Promise<void> {
    const staleBefore = new Date(Date.now() - this.staleLockMs);
    await this.outboxEventModel.updateMany(
      {
        status: OutboxStatus.PROCESSING,
        lockedAt: { $lt: staleBefore },
      },
      {
        $set: {
          status: OutboxStatus.PENDING,
          lockedAt: null,
          nextRetryAt: new Date(),
          lastError: 'Recovered stale lock',
        },
      },
    );
  }

  private async lockNextEvent(): Promise<OutboxEvent | null> {
    const now = new Date();
    return this.outboxEventModel.findOneAndUpdate(
      {
        status: OutboxStatus.PENDING,
        $or: [{ nextRetryAt: null }, { nextRetryAt: { $lte: now } }],
      },
      {
        $set: {
          status: OutboxStatus.PROCESSING,
          lockedAt: now,
        },
      },
      {
        new: true,
        sort: { createdAt: 1 },
      },
    );
  }

  private async processEvent(event: OutboxEvent): Promise<void> {
    try {
      await this.processPush(event);
      await this.processEmail(event);
      await this.outboxEventModel.updateOne(
        { _id: event._id, status: OutboxStatus.PROCESSING },
        {
          $set: {
            status: OutboxStatus.PROCESSED,
            processedAt: new Date(),
            lastError: null,
            lockedAt: null,
          },
        },
      );
    } catch (error) {
      const eventId = String(event._id);
      const nextAttempts = event.attempts + 1;
      const maxAttempts = event.maxAttempts ?? 3;
      const shouldFail = nextAttempts >= maxAttempts;
      const backoffMs = Math.min(60_000, 2 ** nextAttempts * 1000);

      await this.outboxEventModel.updateOne(
        { _id: event._id, status: OutboxStatus.PROCESSING },
        {
          $set: {
            status: shouldFail ? OutboxStatus.FAILED : OutboxStatus.PENDING,
            attempts: nextAttempts,
            nextRetryAt: shouldFail ? null : new Date(Date.now() + backoffMs),
            lastError: error instanceof Error ? error.message : 'Unknown error',
            lockedAt: null,
          },
        },
      );
      this.logger.error(
        `Outbox event ${eventId} failed (attempt ${nextAttempts}/${maxAttempts})`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private async processPush(event: OutboxEvent): Promise<void> {
    if (!event.recipientTokens?.length) {
      return;
    }
    const payload = event.payload as {
      type?: string;
      screen?: string;
      entityId?: string;
      params?: Record<string, string>;
      sentAt?: string;
    };
    await this.notificationsService.sendOutboxPushByTokens(
      event.recipientTokens,
      payload,
    );
  }

  private async processEmail(event: OutboxEvent): Promise<void> {
    if (!event.recipientEmail || !event.emailTemplate) {
      return;
    }
    const email = this.resolveEmailTemplate(
      event.emailTemplate.templateId,
      event.emailTemplate.data || {},
    );
    await this.emailService.sendMail({
      to: event.recipientEmail,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
  }

  private resolveEmailTemplate(
    templateId: string,
    data: Record<string, unknown>,
  ): { subject: string; html: string; text?: string } {
    const subject = typeof data.subject === 'string' ? data.subject : null;
    const html = typeof data.html === 'string' ? data.html : null;
    const text = typeof data.text === 'string' ? data.text : undefined;

    if (subject && html) {
      return { subject, html, text };
    }

    throw new Error(
      `Unsupported email template '${templateId}'. Provide subject/html in emailTemplate.data.`,
    );
  }
}
