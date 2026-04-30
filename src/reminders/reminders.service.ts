import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DateTime } from 'luxon';
import { OutboxService } from 'src/notifications/outbox.service';
import { buildNotificationData } from 'src/notifications/notification-payload.util';
import { activityStartDateTimeLondon, UK_TZ } from 'src/utils/uk-time';
import { Activity, ActivityStatus } from 'src/schemas/activity.schema';
import { Booking, BookingStatus } from 'src/schemas/booking.schema';
import { NotificationToken } from 'src/schemas/notifications.schema';

@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    @InjectModel(Activity.name)
    private readonly activityModel: Model<Activity>,
    @InjectModel(Booking.name)
    private readonly bookingModel: Model<Booking>,
    @InjectModel(NotificationToken.name)
    private readonly notificationTokenModel: Model<NotificationToken>,
    private readonly outboxService: OutboxService,
  ) {}

  /**
   * Auto-complete past activities so hosts don't need to mark completion manually.
   */
  @Cron('*/15 * * * *')
  async autoCompletePastActivities(): Promise<void> {
    try {
      const nowLondon = DateTime.now().setZone(UK_TZ);
      const queryFromUtc = nowLondon
        .minus({ days: 2 })
        .startOf('day')
        .toUTC()
        .toJSDate();
      const queryToUtc = nowLondon.endOf('day').toUTC().toJSDate();

      const activities = await this.activityModel
        .find({
          status: ActivityStatus.ACTIVE,
          deleted_at: null,
          date: { $gte: queryFromUtc, $lte: queryToUtc },
        })
        .select('_id title date time status')
        .lean();

      let completedCount = 0;
      let reviewEventsEnqueued = 0;

      for (const activity of activities) {
        const activityId = this.toStringId(activity._id);
        if (!activityId) {
          continue;
        }

        const activityStart = activityStartDateTimeLondon(
          new Date(activity.date),
          activity.time || '',
        );
        if (!activityStart) {
          continue;
        }

        if (activityStart > nowLondon) {
          continue;
        }

        const updated = await this.activityModel.findOneAndUpdate(
          { _id: activity._id, status: ActivityStatus.ACTIVE },
          {
            $set: {
              status: ActivityStatus.COMPLETED,
              updated_at: new Date(),
            },
          },
          { new: true },
        );

        if (!updated) {
          continue;
        }
        completedCount++;

        const bookings = await this.bookingModel
          .find({
            activityId: new Types.ObjectId(activityId),
            status: BookingStatus.CONFIRMED,
            deleted_at: null,
          })
          .select('_id memberId')
          .lean();

        for (const booking of bookings) {
          const bookingId = this.toStringId(booking._id);
          if (!bookingId) {
            continue;
          }
          const userId = booking.memberId.toString();
          await this.bookingModel.updateOne(
            { _id: booking._id, completedAt: null },
            { $set: { completedAt: new Date() } },
          );

          const payload = buildNotificationData(
            'review_request',
            'WriteReview',
            bookingId,
            {
              activityTitle: activity.title || '',
              hostName: '',
            },
          );

          await this.outboxService.enqueue(null, {
            type: 'review_request',
            entityId: bookingId,
            recipientUserId: userId,
            recipientTokens: await this.getTokensByUserId(userId),
            payload,
            idempotencyKey: `review_request:${bookingId}:${userId}`,
          });
          reviewEventsEnqueued++;
        }
      }

      this.logger.log(
        `Auto-complete cron finished. Completed ${completedCount} activities and enqueued ${reviewEventsEnqueued} review requests.`,
      );
    } catch (error) {
      this.logger.error(
        'Auto-complete cron failed',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /**
   * Enqueue 24-hour activity reminders for confirmed bookings.
   */
  @Cron('*/15 * * * *')
  async enqueueActivityReminder24h(): Promise<void> {
    try {
      const now = DateTime.now().setZone(UK_TZ);
      const windowStart = now.plus({ hours: 23 });
      const windowEnd = now.plus({ hours: 25 });

      const dateStartUtc = windowStart.startOf('day').toUTC().toJSDate();
      const dateEndUtc = windowEnd.endOf('day').toUTC().toJSDate();

      const activities = await this.activityModel
        .find({
          status: { $in: ['active', 'published'] },
          reminded24h: false,
          deleted_at: null,
          date: { $gte: dateStartUtc, $lte: dateEndUtc },
        })
        .select('_id title date time reminded24h')
        .lean();

      let enqueued = 0;
      for (const activity of activities) {
        const activityId = this.toStringId(activity._id);
        if (!activityId) {
          continue;
        }
        const startTime = activityStartDateTimeLondon(
          new Date(activity.date),
          activity.time || '',
        );
        if (!startTime || startTime < windowStart || startTime > windowEnd) {
          continue;
        }

        const bookings = await this.bookingModel
          .find({
            activityId: new Types.ObjectId(activityId),
            status: BookingStatus.CONFIRMED,
            deleted_at: null,
          })
          .select('_id memberId')
          .lean();

        for (const booking of bookings) {
          const userId = booking.memberId.toString();
          const tokens = await this.getTokensByUserId(userId);
          const payload = buildNotificationData(
            'activity_reminder_24h',
            'ActivityDetail',
            activityId,
            {
              activityTitle: activity.title || '',
              startTime: startTime.toISO() || '',
            },
          );

          await this.outboxService.enqueue(null, {
            type: 'activity_reminder_24h',
            entityId: activityId,
            recipientUserId: userId,
            recipientTokens: tokens,
            payload,
            idempotencyKey: `activity_reminder_24h:${activityId}:${userId}`,
          });
          enqueued++;
        }

        await this.activityModel.updateOne(
          { _id: activity._id, reminded24h: false },
          { $set: { reminded24h: true, updated_at: new Date() } },
        );
      }

      this.logger.log(
        `24h reminder cron finished. Enqueued ${enqueued} outbox events.`,
      );
    } catch (error) {
      this.logger.error(
        '24h reminder cron failed',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /**
   * Enqueue 1-hour activity reminders for confirmed bookings.
   */
  @Cron('*/15 * * * *')
  async enqueueActivityReminder1h(): Promise<void> {
    try {
      const now = DateTime.now().setZone(UK_TZ);
      const windowStart = now.plus({ minutes: 45 });
      const windowEnd = now.plus({ minutes: 75 });

      const dateStartUtc = windowStart.startOf('day').toUTC().toJSDate();
      const dateEndUtc = windowEnd.endOf('day').toUTC().toJSDate();

      const activities = await this.activityModel
        .find({
          status: { $in: ['active', 'published'] },
          reminded1h: false,
          deleted_at: null,
          date: { $gte: dateStartUtc, $lte: dateEndUtc },
        })
        .select('_id title date time reminded1h')
        .lean();

      let enqueued = 0;
      for (const activity of activities) {
        const activityId = this.toStringId(activity._id);
        if (!activityId) {
          continue;
        }
        const startTime = activityStartDateTimeLondon(
          new Date(activity.date),
          activity.time || '',
        );
        if (!startTime || startTime < windowStart || startTime > windowEnd) {
          continue;
        }

        const bookings = await this.bookingModel
          .find({
            activityId: new Types.ObjectId(activityId),
            status: BookingStatus.CONFIRMED,
            deleted_at: null,
          })
          .select('_id memberId')
          .lean();

        for (const booking of bookings) {
          const userId = booking.memberId.toString();
          const tokens = await this.getTokensByUserId(userId);
          const payload = buildNotificationData(
            'activity_reminder_1h',
            'ActivityDetail',
            activityId,
            {
              activityTitle: activity.title || '',
              startTime: startTime.toISO() || '',
            },
          );

          await this.outboxService.enqueue(null, {
            type: 'activity_reminder_1h',
            entityId: activityId,
            recipientUserId: userId,
            recipientTokens: tokens,
            payload,
            idempotencyKey: `activity_reminder_1h:${activityId}:${userId}`,
          });
          enqueued++;
        }

        await this.activityModel.updateOne(
          { _id: activity._id, reminded1h: false },
          { $set: { reminded1h: true, updated_at: new Date() } },
        );
      }

      this.logger.log(
        `1h reminder cron finished. Enqueued ${enqueued} outbox events.`,
      );
    } catch (error) {
      this.logger.error(
        '1h reminder cron failed',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /**
   * Enqueue review request notifications for recently completed bookings.
   */
  @Cron('0 * * * *')
  async enqueueReviewRequests(): Promise<void> {
    try {
      const now = DateTime.now().setZone(UK_TZ);
      const windowStart = now.minus({ hours: 4 }).toUTC().toJSDate();
      const windowEnd = now.minus({ hours: 2 }).toUTC().toJSDate();

      const bookings = await this.bookingModel
        .find({
          status: 'completed',
          completedAt: { $gte: windowStart, $lte: windowEnd },
          deleted_at: null,
          $or: [
            { reviewRequested: false },
            { reviewRequested: { $exists: false } },
          ],
        })
        .populate('activityId', 'title')
        .populate('hostId', 'name')
        .select('_id memberId activityId hostId')
        .lean();

      let enqueued = 0;
      for (const booking of bookings) {
        const bookingId = this.toStringId(booking._id);
        const userId = this.toStringId(booking.memberId);
        if (!userId || !bookingId) {
          continue;
        }
        const activityTitle = this.extractField(booking.activityId, 'title');
        const hostName = this.extractField(booking.hostId, 'name');

        const payload = buildNotificationData(
          'review_request',
          'WriteReview',
          bookingId,
          {
            activityTitle,
            hostName,
          },
        );

        await this.outboxService.enqueue(null, {
          type: 'review_request',
          entityId: bookingId,
          recipientUserId: userId,
          recipientTokens: await this.getTokensByUserId(userId),
          payload,
          idempotencyKey: `review_request:${bookingId}:${userId}`,
        });

        await this.bookingModel.updateOne(
          { _id: booking._id, reviewRequested: { $ne: true } },
          { $set: { reviewRequested: true, updated_at: new Date() } },
        );
        enqueued++;
      }

      this.logger.log(
        `Review request cron finished. Enqueued ${enqueued} outbox events.`,
      );
    } catch (error) {
      this.logger.error(
        'Review request cron failed',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /**
   * Auto-cancel abandoned pending bookings older than 30 minutes and enqueue notifications.
   */
  @Cron('*/10 * * * *')
  async cleanupAbandonedPendingBookings(): Promise<void> {
    try {
      const olderThan = DateTime.now()
        .minus({ minutes: 30 })
        .toUTC()
        .toJSDate();

      const bookings = await this.bookingModel
        .find({
          status: BookingStatus.PENDING,
          created_at: { $lt: olderThan },
          deleted_at: null,
        })
        .select('_id memberId hostId activityId')
        .lean();

      let enqueued = 0;
      for (const booking of bookings) {
        const bookingId = this.toStringId(booking._id);
        if (!bookingId) {
          continue;
        }
        const updated = await this.bookingModel.findOneAndUpdate(
          {
            _id: booking._id,
            status: BookingStatus.PENDING,
          },
          {
            $set: {
              status: BookingStatus.CANCELLED,
              declineReason: 'Auto-cancelled due to pending timeout',
              updated_at: new Date(),
            },
          },
          { new: true },
        );

        if (!updated) {
          continue;
        }
        const activityId = booking.activityId.toString();
        const memberId = booking.memberId.toString();
        const hostId = booking.hostId.toString();

        await this.outboxService.enqueue(null, {
          type: 'booking_declined',
          entityId: bookingId,
          recipientUserId: memberId,
          recipientTokens: await this.getTokensByUserId(memberId),
          payload: buildNotificationData(
            'booking_declined',
            'BookingDetail',
            bookingId,
            { bookingId, activityId },
          ),
          idempotencyKey: `abandoned_booking:${bookingId}:${memberId}`,
        });
        enqueued++;

        await this.outboxService.enqueue(null, {
          type: 'new_booking_host',
          entityId: bookingId,
          recipientUserId: hostId,
          recipientTokens: await this.getTokensByUserId(hostId),
          payload: buildNotificationData(
            'new_booking_host',
            'BookingDetail',
            bookingId,
            { bookingId, activityId, reason: 'auto_cancelled' },
          ),
          idempotencyKey: `abandoned_booking:${bookingId}:${hostId}`,
        });
        enqueued++;
      }

      this.logger.log(
        `Abandoned booking cleanup cron finished. Enqueued ${enqueued} outbox events.`,
      );
    } catch (error) {
      this.logger.error(
        'Abandoned booking cleanup cron failed',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private async getTokensByUserId(userId: string): Promise<string[]> {
    const tokens = await this.notificationTokenModel
      .find({ userId })
      .select('token -_id')
      .lean();
    return [...new Set(tokens.map((tokenDoc) => tokenDoc.token))];
  }

  private extractField(candidate: unknown, field: string): string {
    if (!candidate || typeof candidate !== 'object') {
      return '';
    }
    const value = (candidate as Record<string, unknown>)[field];
    return typeof value === 'string' ? value : '';
  }

  private toStringId(value: unknown): string | null {
    if (!value) {
      return null;
    }
    if (value instanceof Types.ObjectId) {
      return value.toString();
    }
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'object' && '_id' in value) {
      const nested = (value as { _id?: unknown })._id;
      if (nested instanceof Types.ObjectId) {
        return nested.toString();
      }
      if (typeof nested === 'string') {
        return nested;
      }
    }
    return null;
  }
}
