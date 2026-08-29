import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Activity,
  ActivityStatus,
  RecurringType,
} from 'src/schemas/activity.schema';
import { Booking, BookingStatus } from 'src/schemas/booking.schema';
import { RecurringSeries } from 'src/schemas/recurring-series.schema';
import { RecurringActivitySpawnService } from './recurring-activity-spawn.service';
import {
  deriveScheduleRuleFromOccurrence,
  occurrenceSlotKey,
  RecurringScheduleRule,
} from 'src/utils/recurring-activity';
import { UK_TZ } from 'src/utils/uk-time';

export type MaintenanceSummary = {
  migratedSeries: number;
  activitiesLinked: number;
  seriesReactivated: number;
  orphanSeriesCreated: number;
  duplicatesRemoved: number;
  seriesAnchorsSynced: number;
  occurrencesCreated: number;
  occurrencesAlreadyExist: number;
  occurrencesSkippedFutureExists: number;
  staleSeriesLinksCleared: number;
  duplicateSeriesMerged: number;
  extraFutureOccurrencesRemoved: number;
  failures: string[];
};

type ActivityLean = {
  _id: Types.ObjectId | string;
  seriesId?: Types.ObjectId | string;
  startDateTime?: Date;
  status?: ActivityStatus;
  created_at?: Date;
};

@Injectable()
export class RecurringSeriesMaintenanceService {
  private readonly logger = new Logger(RecurringSeriesMaintenanceService.name);

  constructor(
    @InjectModel(Activity.name)
    private readonly activityModel: Model<Activity>,
    @InjectModel(RecurringSeries.name)
    private readonly recurringSeriesModel: Model<RecurringSeries>,
    @InjectModel(Booking.name)
    private readonly bookingModel: Model<Booking>,
    private readonly recurringActivitySpawnService: RecurringActivitySpawnService,
  ) {}

  async runFullMaintenance(): Promise<MaintenanceSummary> {
    const summary: MaintenanceSummary = {
      migratedSeries: 0,
      activitiesLinked: 0,
      seriesReactivated: 0,
      orphanSeriesCreated: 0,
      duplicatesRemoved: 0,
      seriesAnchorsSynced: 0,
      occurrencesCreated: 0,
      occurrencesAlreadyExist: 0,
      occurrencesSkippedFutureExists: 0,
      staleSeriesLinksCleared: 0,
      duplicateSeriesMerged: 0,
      extraFutureOccurrencesRemoved: 0,
      failures: [],
    };

    this.logger.log('Recurring series maintenance started');

    summary.staleSeriesLinksCleared = await this.clearStaleSeriesLinks();
    summary.duplicateSeriesMerged = await this.mergeDuplicateSeries();
    await this.migrateLegacyChains(summary);
    summary.duplicateSeriesMerged += await this.mergeDuplicateSeries();
    await this.repairOrphanActivities(summary);
    summary.seriesAnchorsSynced = await this.syncSeriesAnchors();
    summary.extraFutureOccurrencesRemoved =
      await this.collapseExtraFutureOccurrences();
    summary.duplicatesRemoved = await this.deduplicateOccurrences();
    await this.reconcileActiveSeries(summary);

    this.logger.log(
      `Recurring series maintenance finished: ${JSON.stringify(summary)}`,
    );

    return summary;
  }

  private async clearStaleSeriesLinks(): Promise<number> {
    const validSeriesIds = new Set(
      (await this.recurringSeriesModel.find({}).select('_id').lean()).map(
        (s) => (s._id as Types.ObjectId).toString(),
      ),
    );

    const linkedActivities = await this.activityModel
      .find({
        deleted_at: null,
        seriesId: { $ne: null },
      })
      .select('_id seriesId')
      .lean();

    let cleared = 0;
    for (const activity of linkedActivities) {
      if (!activity.seriesId) {
        continue;
      }
      if (!validSeriesIds.has(activity.seriesId.toString())) {
        await this.activityModel.updateOne(
          { _id: activity._id },
          { $unset: { seriesId: '' } },
        );
        cleared++;
      }
    }

    return cleared;
  }

  private legacyChainKey(activity: {
    _id: Types.ObjectId | unknown;
    hostId: Types.ObjectId | unknown;
    title: string;
    recurring: RecurringType;
    originalActivityId?: Types.ObjectId | null;
  }): string {
    if (activity.originalActivityId) {
      return (activity.originalActivityId as Types.ObjectId).toString();
    }

    // Spawned occurrences without originalActivityId belong to the same series
    // when host, title, and recurrence match (legacy data before seriesId existed).
    return `legacy:${(activity.hostId as Types.ObjectId).toString()}:${activity.title}:${activity.recurring}`;
  }

  private isObjectIdChainKey(chainKey: string): boolean {
    return Types.ObjectId.isValid(chainKey) && chainKey.length === 24;
  }

  /** Collapse multiple RecurringSeries docs for the same host+title+recurrence. */
  private async mergeDuplicateSeries(): Promise<number> {
    const groups = await this.recurringSeriesModel.aggregate<{
      _id: { hostId: Types.ObjectId; title: string; recurring: string };
      seriesIds: Types.ObjectId[];
      count: number;
    }>([
      {
        $group: {
          _id: { hostId: '$hostId', title: '$title', recurring: '$recurring' },
          seriesIds: { $push: '$_id' },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ]);

    let merged = 0;

    for (const group of groups) {
      const seriesList = await this.recurringSeriesModel
        .find({ _id: { $in: group.seriesIds } })
        .sort({ createdAt: 1 })
        .lean();

      if (seriesList.length <= 1) {
        continue;
      }

      const [canonical, ...duplicates] = seriesList;
      const canonicalId = canonical._id as Types.ObjectId;

      for (const duplicate of duplicates) {
        await this.activityModel.updateMany(
          { seriesId: duplicate._id, deleted_at: null },
          { $set: { seriesId: canonicalId } },
        );
        await this.recurringSeriesModel.deleteOne({ _id: duplicate._id });
        merged++;
      }

      const maxStart = await this.activityModel
        .findOne({ seriesId: canonicalId, deleted_at: null })
        .sort({ startDateTime: -1 })
        .select('startDateTime')
        .lean();

      if (maxStart?.startDateTime) {
        await this.recurringSeriesModel.updateOne(
          { _id: canonicalId },
          {
            $set: {
              lastOccurrenceStartDateTime: new Date(maxStart.startDateTime),
              updatedAt: new Date(),
            },
          },
        );
      }
    }

    return merged;
  }

  /**
   * Per series, keep only the earliest future active occurrence; remove extras.
   */
  private async collapseExtraFutureOccurrences(): Promise<number> {
    const now = new Date();
    const seriesIds = await this.activityModel.distinct('seriesId', {
      seriesId: { $ne: null },
      deleted_at: null,
    });

    let removed = 0;

    for (const seriesId of seriesIds) {
      if (!seriesId) {
        continue;
      }

      const futureActive = await this.activityModel
        .find({
          seriesId,
          deleted_at: null,
          status: ActivityStatus.ACTIVE,
          startDateTime: { $gt: now },
        })
        .sort({ startDateTime: 1 })
        .select('_id')
        .lean();

      if (futureActive.length <= 1) {
        continue;
      }

      const [, ...extras] = futureActive;
      for (const extra of extras) {
        await this.activityModel.updateOne(
          { _id: extra._id, deleted_at: null },
          { $set: { deleted_at: now, updated_at: now } },
        );
        removed++;
      }
    }

    return removed;
  }

  /**
   * Build one RecurringSeries per legacy chain.
   */
  private async migrateLegacyChains(
    summary: MaintenanceSummary,
  ): Promise<void> {
    const recurringActivities = await this.activityModel
      .find({
        deleted_at: null,
        seriesId: null,
        recurring: {
          $in: [
            RecurringType.DAILY,
            RecurringType.WEEKLY,
            RecurringType.MONTHLY,
            RecurringType.YEARLY,
          ],
        },
      })
      .lean();

    const chains = new Map<string, (typeof recurringActivities)[number][]>();

    for (const activity of recurringActivities) {
      const chainKey = this.legacyChainKey({
        _id: activity._id,
        hostId: activity.hostId as Types.ObjectId,
        title: activity.title,
        recurring: activity.recurring as RecurringType,
        originalActivityId: activity.originalActivityId as Types.ObjectId | null,
      });

      const bucket = chains.get(chainKey) ?? [];
      bucket.push(activity);
      chains.set(chainKey, bucket);
    }

    for (const [chainKey, members] of chains) {
      const rootCandidateId = this.isObjectIdChainKey(chainKey)
        ? new Types.ObjectId(chainKey)
        : ([...members].sort(
            (a, b) =>
              new Date(a.startDateTime as Date).getTime() -
              new Date(b.startDateTime as Date).getTime(),
          )[0]._id as Types.ObjectId);

      const existingSeries = await this.recurringSeriesModel
        .findOne({
          $or: [
            { migratedFromRootActivityId: rootCandidateId },
            {
              hostId: members[0].hostId,
              title: members[0].title,
              recurring: members[0].recurring,
            },
          ],
        })
        .lean();

      if (existingSeries) {
        await this.activityModel.updateMany(
          {
            deleted_at: null,
            _id: { $in: members.map((m) => m._id) },
          },
          { $set: { seriesId: existingSeries._id } },
        );
        continue;
      }

      const root =
        members.find(
          (m) => (m._id as Types.ObjectId).toString() === rootCandidateId.toString(),
        ) ??
        [...members].sort(
          (a, b) =>
            new Date(a.startDateTime as Date).getTime() -
            new Date(b.startDateTime as Date).getTime(),
        )[0];

      if (!root?.startDateTime || !root.endDateTime) {
        summary.failures.push(
          `migrate: chain ${chainKey} missing datetimes on template activity`,
        );
        continue;
      }

      try {
        const scheduleRule = deriveScheduleRuleFromOccurrence(
          new Date(root.startDateTime),
          new Date(root.endDateTime),
          root.recurring as RecurringType,
          UK_TZ,
        );

        const memberIds = members.map((m) => m._id as Types.ObjectId);
        const chainActivities = await this.activityModel
          .find({
            deleted_at: null,
            _id: { $in: memberIds },
          })
          .select('startDateTime status')
          .lean();

        const startTimes = chainActivities
          .map((a) => a.startDateTime)
          .filter(Boolean)
          .map((d) => new Date(d as Date).getTime());

        if (startTimes.length === 0) {
          summary.failures.push(`migrate: chain ${chainKey} has no start times`);
          continue;
        }

        const cancelledMembers = chainActivities.filter(
          (a) => a.status === ActivityStatus.CANCELLED,
        ).length;
        const active =
          root.status !== ActivityStatus.CANCELLED &&
          cancelledMembers < chainActivities.length;

        const series = await this.recurringSeriesModel.create({
          hostId: root.hostId,
          recurring: root.recurring,
          scheduleRule,
          active,
          recurrenceStoppedAt: active ? null : new Date(),
          lastOccurrenceStartDateTime: new Date(Math.max(...startTimes)),
          title: root.title,
          description: root.description,
          category: root.category,
          location: root.location,
          coordinates: root.coordinates,
          difficultyLevel: root.difficultyLevel,
          maxParticipants: root.maxParticipants,
          price: root.price ?? 0,
          additionalInformation: root.additionalInformation,
          picture: root.picture,
          pictures: root.pictures?.length ? root.pictures : [root.picture],
          migratedFromRootActivityId: rootCandidateId,
        });

        const linked = await this.activityModel.updateMany(
          {
            deleted_at: null,
            _id: { $in: memberIds },
          },
          { $set: { seriesId: series._id } },
        );

        summary.migratedSeries++;
        summary.activitiesLinked += linked.modifiedCount;
      } catch (error) {
        summary.failures.push(
          `migrate: chain ${chainKey}: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      }
    }
  }

  private async repairOrphanActivities(
    summary: MaintenanceSummary,
  ): Promise<void> {
    const orphans = await this.activityModel
      .find({
        deleted_at: null,
        seriesId: null,
        recurring: {
          $in: [
            RecurringType.DAILY,
            RecurringType.WEEKLY,
            RecurringType.MONTHLY,
            RecurringType.YEARLY,
          ],
        },
      })
      .lean();

    for (const orphan of orphans) {
      if (orphan.originalActivityId) {
        const linkedSeriesId = await this.findSeriesIdForLegacyChain(
          orphan.originalActivityId as Types.ObjectId,
        );
        if (linkedSeriesId) {
          await this.activityModel.updateOne(
            { _id: orphan._id },
            { $set: { seriesId: linkedSeriesId } },
          );
          summary.activitiesLinked++;
          continue;
        }
      }

      const matchingSeries = await this.recurringSeriesModel
        .findOne({
          hostId: orphan.hostId,
          title: orphan.title,
          recurring: orphan.recurring,
        })
        .lean();
      if (matchingSeries) {
        await this.activityModel.updateOne(
          { _id: orphan._id },
          { $set: { seriesId: matchingSeries._id } },
        );
        summary.activitiesLinked++;
        continue;
      }

      if (!orphan.startDateTime || !orphan.endDateTime) {
        summary.failures.push(
          `repair: orphan ${(orphan._id as Types.ObjectId).toString()} missing datetimes`,
        );
        continue;
      }

      try {
        const scheduleRule = deriveScheduleRuleFromOccurrence(
          new Date(orphan.startDateTime),
          new Date(orphan.endDateTime),
          orphan.recurring as RecurringType,
          UK_TZ,
        );

        const series = await this.recurringSeriesModel.create({
          hostId: orphan.hostId,
          recurring: orphan.recurring,
          scheduleRule,
          active: orphan.status !== ActivityStatus.CANCELLED,
          recurrenceStoppedAt:
            orphan.status === ActivityStatus.CANCELLED ? new Date() : null,
          lastOccurrenceStartDateTime: new Date(orphan.startDateTime),
          title: orphan.title,
          description: orphan.description,
          category: orphan.category,
          location: orphan.location,
          coordinates: orphan.coordinates,
          difficultyLevel: orphan.difficultyLevel,
          maxParticipants: orphan.maxParticipants,
          price: orphan.price ?? 0,
          additionalInformation: orphan.additionalInformation,
          picture: orphan.picture,
          pictures: orphan.pictures?.length ? orphan.pictures : [orphan.picture],
          migratedFromRootActivityId:
            (orphan.originalActivityId as Types.ObjectId | undefined) ??
            (orphan._id as Types.ObjectId),
        });

        await this.activityModel.updateOne(
          { _id: orphan._id },
          { $set: { seriesId: series._id } },
        );
        summary.orphanSeriesCreated++;
        summary.activitiesLinked++;
      } catch (error) {
        summary.failures.push(
          `repair: orphan ${(orphan._id as Types.ObjectId).toString()}: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      }
    }
  }

  private async findSeriesIdForLegacyChain(
    originalActivityId: Types.ObjectId,
  ): Promise<Types.ObjectId | null> {
    const root = await this.activityModel
      .findOne({ _id: originalActivityId, deleted_at: null })
      .select('seriesId')
      .lean();
    if (root?.seriesId) {
      return root.seriesId as Types.ObjectId;
    }

    const chainMate = await this.activityModel
      .findOne({
        originalActivityId,
        seriesId: { $ne: null },
        deleted_at: null,
      })
      .select('seriesId')
      .lean();

    return (chainMate?.seriesId as Types.ObjectId | undefined) ?? null;
  }

  async syncSeriesAnchors(): Promise<number> {
    const seriesList = await this.recurringSeriesModel.find({}).select('_id');
    let synced = 0;

    for (const series of seriesList) {
      const latest = await this.activityModel
        .findOne({ seriesId: series._id, deleted_at: null })
        .sort({ startDateTime: -1 })
        .select('startDateTime')
        .lean();

      if (!latest?.startDateTime) {
        continue;
      }

      await this.recurringSeriesModel.updateOne(
        { _id: series._id },
        {
          $set: {
            lastOccurrenceStartDateTime: new Date(latest.startDateTime),
            updatedAt: new Date(),
          },
        },
      );
      synced++;
    }

    return synced;
  }

  async deduplicateOccurrences(): Promise<number> {
    const activities = await this.activityModel
      .find({
        seriesId: { $ne: null },
        deleted_at: null,
      })
      .select('_id seriesId startDateTime status created_at')
      .lean();

    const seriesRules = new Map<string, RecurringScheduleRule>();
    const groups = new Map<string, ActivityLean[]>();

    for (const activity of activities) {
      if (!activity.seriesId || !activity.startDateTime) {
        continue;
      }

      const seriesIdStr = activity.seriesId.toString();
      let rule = seriesRules.get(seriesIdStr);
      if (!rule) {
        const series = await this.recurringSeriesModel
          .findById(activity.seriesId)
          .select('scheduleRule')
          .lean();
        if (!series?.scheduleRule) {
          continue;
        }
        rule = series.scheduleRule as RecurringScheduleRule;
        seriesRules.set(seriesIdStr, rule);
      }

      const key = occurrenceSlotKey(
        seriesIdStr,
        new Date(activity.startDateTime),
        rule,
      );
      const bucket = groups.get(key) ?? [];
      bucket.push({
        _id: activity._id as Types.ObjectId,
        seriesId: activity.seriesId as Types.ObjectId | undefined,
        startDateTime: activity.startDateTime as Date | undefined,
        status: activity.status as ActivityStatus | undefined,
        created_at: activity.created_at as Date | undefined,
      });
      groups.set(key, bucket);
    }

    let removed = 0;
    const now = new Date();

    for (const group of groups.values()) {
      if (group.length <= 1) {
        continue;
      }

      const keeper = await this.pickOccurrenceToKeep(group);
      const keeperId = keeper._id.toString();
      for (const duplicate of group) {
        if (duplicate._id.toString() === keeperId) {
          continue;
        }

        await this.activityModel.updateOne(
          { _id: duplicate._id, deleted_at: null },
          { $set: { deleted_at: now, updated_at: now } },
        );
        removed++;
      }
    }

    return removed;
  }

  private async pickOccurrenceToKeep(
    group: ActivityLean[],
  ): Promise<ActivityLean> {
    const withBookings = await Promise.all(
      group.map(async (activity) => {
        const bookingCount = await this.bookingModel.countDocuments({
          activityId: activity._id,
          status: BookingStatus.CONFIRMED,
          deleted_at: null,
        });
        return { activity, bookingCount };
      }),
    );

    withBookings.sort((a, b) => {
      if (b.bookingCount !== a.bookingCount) {
        return b.bookingCount - a.bookingCount;
      }
      if (a.activity.status === ActivityStatus.ACTIVE) {
        return -1;
      }
      if (b.activity.status === ActivityStatus.ACTIVE) {
        return 1;
      }
      const aCreated = a.activity.created_at?.getTime() ?? 0;
      const bCreated = b.activity.created_at?.getTime() ?? 0;
      return aCreated - bCreated;
    });

    return withBookings[0].activity;
  }

  private async reconcileActiveSeries(
    summary: MaintenanceSummary,
  ): Promise<void> {
    const activeSeries = await this.recurringSeriesModel
      .find({ active: true })
      .select('_id')
      .lean();

    for (const series of activeSeries) {
      const result =
        await this.recurringActivitySpawnService.ensureNextOccurrenceForSeries(
          series._id as Types.ObjectId,
        );

      switch (result.status) {
        case 'created':
          summary.occurrencesCreated++;
          break;
        case 'already_exists':
          summary.occurrencesAlreadyExist++;
          break;
        case 'future_already_scheduled':
          summary.occurrencesSkippedFutureExists++;
          break;
        case 'error':
          summary.failures.push(
            `reconcile: series ${series._id.toString()}: ${result.message ?? 'error'}`,
          );
          break;
        default:
          break;
      }
    }
  }
}
