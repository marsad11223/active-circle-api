import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';
import { NotificationToken } from 'src/schemas/notifications.schema';

type PushPayload = Record<string, unknown>;
type ExpoSdkModule = typeof import('expo-server-sdk');

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private expoSdk: ExpoSdkModule | null = null;
  private expoClient: InstanceType<ExpoSdkModule['Expo']> | null = null;

  constructor(
    @InjectModel(NotificationToken.name)
    private readonly notificationTokenModel: Model<NotificationToken>,
  ) {}

  async registerToken(userId: string, token: string): Promise<NotificationToken> {
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
  ): Promise<ExpoPushTicket[]> {
    const tokens = await this.notificationTokenModel
      .find({ userId: userId.trim() })
      .select('token -_id')
      .lean();

    const userTokens = tokens.map((item) => item.token);
    return this.sendWithTokens(userTokens, title, body, data);
  }

  async sendToMultipleUsers(
    userIds: string[],
    title: string,
    body: string,
    data?: PushPayload,
  ): Promise<ExpoPushTicket[]> {
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return [];
    }

    const normalizedUserIds = userIds
      .map((id) => id?.trim())
      .filter((id): id is string => Boolean(id));

    if (normalizedUserIds.length === 0) {
      return [];
    }

    const tokens = await this.notificationTokenModel
      .find({ userId: { $in: normalizedUserIds } })
      .select('token -_id')
      .lean();

    const userTokens = [...new Set(tokens.map((item) => item.token))];
    return this.sendWithTokens(userTokens, title, body, data);
  }

  async sendToAll(
    title: string,
    body: string,
    data?: PushPayload,
  ): Promise<ExpoPushTicket[]> {
    const tokens = await this.notificationTokenModel
      .find({})
      .select('token -_id')
      .lean();

    const allTokens = [...new Set(tokens.map((item) => item.token))];
    return this.sendWithTokens(allTokens, title, body, data);
  }

  private async sendWithTokens(
    tokens: string[],
    title: string,
    body: string,
    data?: PushPayload,
  ): Promise<ExpoPushTicket[]> {
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

    const messages: ExpoPushMessage[] = validTokens.map((token) => ({
      to: token,
      sound: 'default',
      title,
      body,
      data,
    }));

    const chunks = expoClient.chunkPushNotifications(messages);
    const tickets: ExpoPushTicket[] = [];

    for (const chunk of chunks) {
      try {
        const chunkTickets =
          await expoClient.sendPushNotificationsAsync(chunk);
        tickets.push(...chunkTickets);
      } catch (error) {
        this.logger.error('Failed to send Expo notification chunk', error);
      }
    }

    this.logTicketErrors(tickets);
    return tickets;
  }

  private logTicketErrors(tickets: ExpoPushTicket[]): void {
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
      this.expoSdk = await import('expo-server-sdk');
    }
    return this.expoSdk;
  }

  private async getExpoClient(): Promise<InstanceType<ExpoSdkModule['Expo']>> {
    if (!this.expoClient) {
      const expoSdk = await this.getExpoSdk();
      this.expoClient = new expoSdk.Expo();
    }
    return this.expoClient;
  }
}
