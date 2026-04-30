import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { NotificationToken } from 'src/schemas/notifications.schema';
import { buildNotificationData } from './notification-payload.util';
import { OutboxService } from './outbox.service';

type PushPayload = Record<string, unknown>;
type PushMessage = {
  to: string;
  sound: 'default';
  title: string;
  body: string;
  data?: PushPayload;
};
type PushTicket = {
  status: 'ok' | 'error';
  message?: string;
  details?: Record<string, unknown>;
};
type ExpoClient = {
  chunkPushNotifications(messages: PushMessage[]): PushMessage[][];
  sendPushNotificationsAsync(chunk: PushMessage[]): Promise<PushTicket[]>;
};
type ExpoSdkModule = {
  Expo: {
    new (): ExpoClient;
    isExpoPushToken(token: string): boolean;
  };
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private expoSdk: ExpoSdkModule | null = null;
  private expoClient: ExpoClient | null = null;

  constructor(
    @InjectModel(NotificationToken.name)
    private readonly notificationTokenModel: Model<NotificationToken>,
    private readonly outboxService: OutboxService,
  ) {}

  async registerToken(
    userId: string,
    token: string,
  ): Promise<NotificationToken> {
    const trimmedUserId = userId?.trim();
    const trimmedToken = token?.trim();

    if (!trimmedUserId || !trimmedToken) {
      throw new Error('userId and token are required');
    }

    const expoSdk = await this.getExpoSdk();
    if (!expoSdk.Expo.isExpoPushToken(trimmedToken)) {
      throw new Error('Invalid Expo push token');
    }

    return this.notificationTokenModel.findOneAndUpdate(
      { token: trimmedToken },
      {
        $set: {
          userId: trimmedUserId,
          token: trimmedToken,
          createdAt: new Date(),
        },
      },
      {
        upsert: true,
        new: true,
      },
    );
  }

  async sendToUser(
    userId: string,
    title: string,
    body: string,
    data?: PushPayload,
  ): Promise<PushTicket[]> {
    const typedPayload = this.asTypedPayload(data);
    const tokens = await this.notificationTokenModel
      .find({ userId: userId.trim() })
      .select('token -_id')
      .lean();

    const userTokens = tokens.map((item) => item.token);
    if (typedPayload) {
      await this.enqueueOutboxEvent(
        typedPayload,
        userId.trim(),
        userTokens,
        null,
        null,
      );
      return [{ status: 'ok' }];
    }
    return this.sendWithTokens(userTokens, title, body, data);
  }

  async sendToMultipleUsers(
    userIds: string[],
    title: string,
    body: string,
    data?: PushPayload,
  ): Promise<PushTicket[]> {
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return [];
    }

    const normalizedUserIds = userIds
      .map((id) => id?.trim())
      .filter((id): id is string => Boolean(id));

    if (normalizedUserIds.length === 0) {
      return [];
    }

    const typedPayload = this.asTypedPayload(data);
    const tokens = await this.notificationTokenModel
      .find({ userId: { $in: normalizedUserIds } })
      .select('userId token -_id')
      .lean();
    if (typedPayload) {
      const tokensByUser = new Map<string, string[]>();
      for (const item of tokens) {
        if (!tokensByUser.has(item.userId)) {
          tokensByUser.set(item.userId, []);
        }
        tokensByUser.get(item.userId)!.push(item.token);
      }
      for (const [recipientUserId, recipientTokens] of tokensByUser.entries()) {
        await this.enqueueOutboxEvent(
          typedPayload,
          recipientUserId,
          [...new Set(recipientTokens)],
          null,
          null,
        );
      }
      return [{ status: 'ok' }];
    }

    const userTokens = [...new Set(tokens.map((item) => item.token))];
    return this.sendWithTokens(userTokens, title, body, data);
  }

  async sendToAll(
    title: string,
    body: string,
    data?: PushPayload,
  ): Promise<PushTicket[]> {
    const typedPayload = this.asTypedPayload(data);
    const tokens = await this.notificationTokenModel
      .find({})
      .select('userId token -_id')
      .lean();
    if (typedPayload) {
      const tokensByUser = new Map<string, string[]>();
      for (const item of tokens) {
        if (!tokensByUser.has(item.userId)) {
          tokensByUser.set(item.userId, []);
        }
        tokensByUser.get(item.userId)!.push(item.token);
      }
      for (const [recipientUserId, recipientTokens] of tokensByUser.entries()) {
        await this.enqueueOutboxEvent(
          typedPayload,
          recipientUserId,
          [...new Set(recipientTokens)],
          null,
          null,
        );
      }
      return [{ status: 'ok' }];
    }

    const allTokens = [...new Set(tokens.map((item) => item.token))];
    return this.sendWithTokens(allTokens, title, body, data);
  }

  async sendOutboxPushByTokens(
    recipientTokens: string[],
    payload: {
      type?: string;
      screen?: string;
      entityId?: string;
      params?: Record<string, string>;
      sentAt?: string;
    },
  ): Promise<PushTicket[]> {
    if (!recipientTokens.length) {
      return [];
    }
    const content = this.getPushContent(payload.type);
    return this.sendWithTokens(recipientTokens, content.title, content.body, {
      type: payload.type || 'feature_announcement',
      screen: payload.screen || '/(tabs)/index',
      entityId: payload.entityId || 'unknown',
      params: payload.params || {},
      sentAt: payload.sentAt || new Date().toISOString(),
    });
  }

  // TODO: wire these helpers with a scheduler/cron module.
  async sendActivityReminder24h(
    userIds: string[],
    activityId: string,
  ): Promise<PushTicket[]> {
    return this.sendToMultipleUsers(
      userIds,
      'Activity Reminder',
      'Your activity starts in 24 hours.',
      buildNotificationData(
        'activity_reminder_24h',
        '/(tabs)/browse-detail',
        activityId,
        {
          id: activityId,
          activityId,
        },
      ),
    );
  }

  // TODO: wire these helpers with a scheduler/cron module.
  async sendActivityReminder1h(
    userIds: string[],
    activityId: string,
  ): Promise<PushTicket[]> {
    return this.sendToMultipleUsers(
      userIds,
      'Activity Reminder',
      'Your activity starts in 1 hour.',
      buildNotificationData(
        'activity_reminder_1h',
        '/(tabs)/browse-detail',
        activityId,
        {
          id: activityId,
          activityId,
        },
      ),
    );
  }

  async sendFeatureAnnouncement(
    title: string,
    body: string,
  ): Promise<PushTicket[]> {
    return this.sendToAll(
      title,
      body,
      buildNotificationData('feature_announcement', '/(tabs)/index', 'all', {}),
    );
  }

  private async sendWithTokens(
    tokens: string[],
    title: string,
    body: string,
    data?: PushPayload,
  ): Promise<PushTicket[]> {
    if (!Array.isArray(tokens) || tokens.length === 0) {
      return [];
    }

    const expoSdk = await this.getExpoSdk();
    const expoClient = await this.getExpoClient();

    const validTokens = tokens.filter((token) =>
      expoSdk.Expo.isExpoPushToken(token),
    );
    const invalidTokens = tokens.filter(
      (token) => !expoSdk.Expo.isExpoPushToken(token),
    );

    if (invalidTokens.length > 0) {
      this.logger.warn(
        `Skipping ${invalidTokens.length} invalid Expo tokens during push send`,
      );
    }

    if (validTokens.length === 0) {
      return [];
    }

    const messages: PushMessage[] = validTokens.map((token) => ({
      to: token,
      sound: 'default',
      title,
      body,
      data,
    }));

    const chunks = expoClient.chunkPushNotifications(messages);
    const tickets: PushTicket[] = [];

    for (const chunk of chunks) {
      try {
        const chunkTickets = await expoClient.sendPushNotificationsAsync(chunk);
        tickets.push(...chunkTickets);
      } catch (error) {
        this.logger.error('Failed to send Expo notification chunk', error);
      }
    }

    this.logTicketErrors(tickets);
    return tickets;
  }

  private asTypedPayload(data?: PushPayload): {
    type: string;
    screen: string;
    entityId: string;
    params: Record<string, string>;
    sentAt: string;
  } | null {
    if (!data) {
      return null;
    }

    const candidate = data as {
      type?: unknown;
      screen?: unknown;
      entityId?: unknown;
      params?: unknown;
      sentAt?: unknown;
    };
    if (
      typeof candidate.type !== 'string' ||
      typeof candidate.screen !== 'string' ||
      typeof candidate.entityId !== 'string' ||
      typeof candidate.sentAt !== 'string' ||
      !candidate.params ||
      typeof candidate.params !== 'object' ||
      Array.isArray(candidate.params)
    ) {
      return null;
    }

    const params: Record<string, string> = {};
    for (const [key, value] of Object.entries(candidate.params)) {
      if (typeof value === 'string') {
        params[key] = value;
      }
    }

    return {
      type: candidate.type,
      screen: candidate.screen,
      entityId: candidate.entityId,
      params,
      sentAt: candidate.sentAt,
    };
  }

  private async enqueueOutboxEvent(
    payload: {
      type: string;
      screen: string;
      entityId: string;
      params: Record<string, string>;
      sentAt: string;
    },
    recipientUserId: string,
    recipientTokens: string[],
    recipientEmail: string | null,
    emailTemplate: { templateId: string; data: Record<string, unknown> } | null,
  ): Promise<void> {
    const idempotencyKey = `${payload.type}:${payload.entityId}:${recipientUserId}`;
    await this.outboxService.enqueue({
      type: payload.type,
      entityId: payload.entityId,
      payload,
      recipientTokens,
      recipientEmail,
      emailTemplate,
      idempotencyKey,
    });
  }

  private getPushContent(type?: string): { title: string; body: string } {
    switch (type) {
      case 'booking_confirmed':
        return {
          title: 'Booking Confirmed',
          body: 'Your session has been booked successfully.',
        };
      case 'new_booking_host':
        return {
          title: 'New Booking',
          body: 'Someone just booked your session.',
        };
      case 'booking_pending':
        return {
          title: 'Booking Pending',
          body: 'Your booking request is pending host approval.',
        };
      case 'booking_approved':
        return {
          title: 'Booking Approved',
          body: 'Your booking request was approved.',
        };
      case 'booking_declined':
        return {
          title: 'Booking Declined',
          body: 'Your booking request was declined.',
        };
      case 'activity_updated':
        return {
          title: 'Activity Updated',
          body: 'An activity you joined has been updated.',
        };
      case 'activity_cancelled':
        return {
          title: 'Activity Cancelled',
          body: 'An activity you joined was cancelled.',
        };
      case 'activity_reminder_24h':
        return {
          title: 'Activity Reminder',
          body: 'Your activity starts in 24 hours.',
        };
      case 'activity_reminder_1h':
        return {
          title: 'Activity Reminder',
          body: 'Your activity starts in 1 hour.',
        };
      case 'new_message':
        return {
          title: 'New Message',
          body: 'You received a new message.',
        };
      case 'host_broadcast':
        return {
          title: 'Host Update',
          body: 'Your host posted a new update.',
        };
      case 'review_request':
        return {
          title: 'Share Your Feedback',
          body: 'How was your activity? Leave a quick review.',
        };
      case 'feature_announcement':
      default:
        return {
          title: 'New Feature',
          body: 'Check out what is new in The Active Circle!',
        };
    }
  }

  private logTicketErrors(tickets: PushTicket[]): void {
    const erroredTickets = tickets.filter(
      (ticket) => ticket.status === 'error',
    );

    for (const ticket of erroredTickets) {
      this.logger.error(
        `Expo push ticket error: ${ticket.message || 'Unknown error'}`,
        ticket.details ? JSON.stringify(ticket.details) : undefined,
      );
    }
  }

  private async getExpoSdk(): Promise<ExpoSdkModule> {
    if (!this.expoSdk) {
      this.expoSdk = (await import('expo-server-sdk')) as ExpoSdkModule;
    }
    return this.expoSdk;
  }

  private async getExpoClient(): Promise<ExpoClient> {
    if (!this.expoClient) {
      const expoSdk = await this.getExpoSdk();
      this.expoClient = new expoSdk.Expo();
    }
    return this.expoClient;
  }
}
