import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Activity, ActivityStatus, RecurringType } from 'src/schemas/activity.schema';
import { RecurringSeries } from 'src/schemas/recurring-series.schema';
import {
  buildOccurrenceEndDateTime,
  EnsureNextOccurrenceResult,
  fastForwardToFuture,
  normalizeOccurrenceRange,
} from 'src/utils/recurring-activity';

const MAX_CREATE_RETRIES = 3;

@Injectable()
export class RecurringActivitySpawnService {
  private readonly logger = new Logger(RecurringActivitySpawnService.name);

  constructor(
    @InjectModel(Activity.name)
    private readonly activityModel: Model<Activity>,
    @InjectModel(RecurringSeries.name)
    private readonly recurringSeriesModel: Model<RecurringSeries>,
  ) {}

  async ensureNextOccurrenceForSeries(
    seriesId: string | Types.ObjectId,
  ): Promise<EnsureNextOccurrenceResult> {
    const series = await this.recurringSeriesModel.findById(seriesId);
    if (!series) {
      return { status: 'error', message: 'Recurring series not found' };
    }

    if (!series.active) {
      return { status: 'not_applicable' };
    }

    if (!series.lastOccurrenceStartDateTime) {
      return {
        status: 'error',
        message: 'Series is missing lastOccurrenceStartDateTime',
      };
    }

    const now = new Date();
    const futureActive = await this.activityModel
      .findOne({
        seriesId: series._id,
        deleted_at: null,
        status: ActivityStatus.ACTIVE,
        startDateTime: { $gt: now },
      })
      .sort({ startDateTime: 1 })
      .select('_id startDateTime')
      .lean();

    if (futureActive) {
      if (futureActive.startDateTime) {
        await this.recurringSeriesModel.updateOne(
          { _id: series._id },
          {
            $max: {
              lastOccurrenceStartDateTime: new Date(futureActive.startDateTime),
            },
            $set: { updatedAt: new Date() },
          },
        );
      }

      return {
        status: 'future_already_scheduled',
        activityId: futureActive._id.toString(),
        startDateTime: futureActive.startDateTime
          ? new Date(futureActive.startDateTime)
          : undefined,
      };
    }

    const nextStart = fastForwardToFuture(
      series.recurring,
      series.scheduleRule,
      series.lastOccurrenceStartDateTime,
      now,
    );
    const nextEnd = buildOccurrenceEndDateTime(nextStart, series.scheduleRule);

    return this.createOccurrenceForSeries(series, nextStart, nextEnd, {
      updateLastOccurrence: true,
    });
  }

  async spawnOccurrenceAt(
    seriesId: string | Types.ObjectId,
    startDateTime: Date,
    endDateTime: Date,
  ): Promise<EnsureNextOccurrenceResult> {
    const series = await this.recurringSeriesModel.findById(seriesId);
    if (!series) {
      return { status: 'error', message: 'Recurring series not found' };
    }

    return this.createOccurrenceForSeries(series, startDateTime, endDateTime, {
      updateLastOccurrence: true,
    });
  }

  private async createOccurrenceForSeries(
    series: RecurringSeries,
    startDateTime: Date,
    endDateTime: Date,
    options: { updateLastOccurrence: boolean },
  ): Promise<EnsureNextOccurrenceResult> {
    const seriesId = series._id as Types.ObjectId;
    const { startDateTime: slotStart, endDateTime: slotEnd } =
      normalizeOccurrenceRange(
        startDateTime,
        series.scheduleRule,
        series.recurring,
      );

    const existing = await this.findExistingOccurrence(
      seriesId,
      slotStart,
      series.scheduleRule,
      series.recurring,
    );

    if (existing) {
      if (options.updateLastOccurrence) {
        await this.recurringSeriesModel.updateOne(
          { _id: seriesId },
          {
            $max: { lastOccurrenceStartDateTime: slotStart },
            $set: { updatedAt: new Date() },
          },
        );
      }

      return {
        status: 'already_exists',
        activityId: existing,
        startDateTime: slotStart,
      };
    }

    for (let attempt = 0; attempt < MAX_CREATE_RETRIES; attempt++) {
      try {
        const activity = await this.activityModel.create({
          hostId: series.hostId,
          title: series.title,
          description: series.description,
          category: series.category,
          location: series.location,
          coordinates: series.coordinates,
          difficultyLevel: series.difficultyLevel,
          startDateTime: slotStart,
          endDateTime: slotEnd,
          date: slotStart,
          maxParticipants: series.maxParticipants,
          price: series.price ?? 0,
          recurring: series.recurring,
          additionalInformation: series.additionalInformation,
          picture: series.picture,
          pictures: series.pictures?.length
            ? series.pictures
            : [series.picture],
          status: ActivityStatus.ACTIVE,
          seriesId,
          created_at: new Date(),
          updated_at: new Date(),
        });

        if (options.updateLastOccurrence) {
          await this.recurringSeriesModel.updateOne(
            { _id: seriesId },
            {
              $max: { lastOccurrenceStartDateTime: slotStart },
              $set: { updatedAt: new Date() },
            },
          );
        }

        return {
          status: 'created',
          activityId: (activity._id as Types.ObjectId).toString(),
          startDateTime: slotStart,
        };
      } catch (error) {
        const isDuplicateKey =
          error &&
          typeof error === 'object' &&
          'code' in error &&
          (error as { code?: number }).code === 11000;

        if (isDuplicateKey) {
          const duplicateId = await this.findExistingOccurrence(
            seriesId,
            slotStart,
            series.scheduleRule,
            series.recurring,
          );

          if (duplicateId) {
            return {
              status: 'already_exists',
              activityId: duplicateId,
              startDateTime: slotStart,
            };
          }
        }

        if (attempt === MAX_CREATE_RETRIES - 1) {
          this.logger.error(
            `Failed to spawn occurrence for series ${seriesId.toString()}`,
            error instanceof Error ? error.stack : undefined,
          );
          return {
            status: 'error',
            message:
              error instanceof Error ? error.message : 'Unknown spawn error',
          };
        }
      }
    }

    return { status: 'error', message: 'Failed to spawn occurrence' };
  }

  private async findExistingOccurrence(
    seriesId: Types.ObjectId,
    slotStart: Date,
    scheduleRule: RecurringSeries['scheduleRule'],
    recurring: RecurringType,
  ): Promise<string | null> {
    const exact = await this.activityModel
      .findOne({
        seriesId,
        startDateTime: slotStart,
        deleted_at: null,
      })
      .select('_id')
      .lean();

    if (exact?._id) {
      return exact._id.toString();
    }

    const windowMs = 60_000;
    const nearMatch = await this.activityModel
      .findOne({
        seriesId,
        deleted_at: null,
        startDateTime: {
          $gte: new Date(slotStart.getTime() - windowMs),
          $lte: new Date(slotStart.getTime() + windowMs),
        },
      })
      .select('_id startDateTime')
      .lean();

    if (!nearMatch?._id || !nearMatch.startDateTime) {
      return null;
    }

    const { startDateTime: normalizedNear } = normalizeOccurrenceRange(
      new Date(nearMatch.startDateTime),
      scheduleRule,
      recurring,
    );

    if (normalizedNear.getTime() === slotStart.getTime()) {
      return nearMatch._id.toString();
    }

    return null;
  }

  async triggerSpawnAfterCompletion(activity: Activity): Promise<void> {
    if (
      activity.recurring === RecurringType.ONE_TIME ||
      !activity.recurring
    ) {
      return;
    }

    if (activity.seriesId) {
      await this.ensureNextOccurrenceForSeries(activity.seriesId);
      return;
    }

    // Legacy unmigrated activities: no automatic spawn (migration required).
  }
}
