/**
 * One-off migration: legacy recurring roots (originalActivityId == null) → RecurringSeries.
 *
 * Usage (staging first):
 *   npm run migrate:recurring-series
 *
 * Idempotent: skips roots whose activities already have seriesId, or a series exists
 * with migratedFromRootActivityId pointing at the root.
 */
import mongoose, { Types } from 'mongoose';

// eslint-disable-next-line @typescript-eslint/no-require-imports
require('dotenv').config();
import {
  ActivitySchema,
  ActivityStatus,
  RecurringType,
} from '../src/schemas/activity.schema';
import { RecurringSeriesSchema } from '../src/schemas/recurring-series.schema';
import { deriveScheduleRuleFromOccurrence } from '../src/utils/recurring-activity';
import { UK_TZ } from '../src/utils/uk-time';

type MigrationFailure = {
  rootActivityId: string;
  reason: string;
};

type MigrationSummary = {
  seriesCreated: number;
  activitiesUpdated: number;
  rootsSkippedAlreadyMigrated: number;
  failures: MigrationFailure[];
};

async function main(): Promise<void> {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI is required');
    process.exit(1);
  }

  await mongoose.connect(uri);

  const Activity = mongoose.model('Activity', ActivitySchema);
  const RecurringSeries = mongoose.model(
    'RecurringSeries',
    RecurringSeriesSchema,
  );

  const summary: MigrationSummary = {
    seriesCreated: 0,
    activitiesUpdated: 0,
    rootsSkippedAlreadyMigrated: 0,
    failures: [],
  };

  const roots = await Activity.find({
    originalActivityId: null,
    recurring: {
      $in: [
        RecurringType.DAILY,
        RecurringType.WEEKLY,
        RecurringType.MONTHLY,
        RecurringType.YEARLY,
      ],
    },
    deleted_at: null,
  }).lean();

  console.log(`Found ${roots.length} legacy recurring root activities`);

  for (const root of roots) {
    const rootId = root._id as Types.ObjectId;
    const rootIdStr = rootId.toString();

    const existingSeries = await RecurringSeries.findOne({
      migratedFromRootActivityId: rootId,
    }).lean();

    if (existingSeries) {
      summary.rootsSkippedAlreadyMigrated++;
      continue;
    }

    if (root.seriesId) {
      summary.rootsSkippedAlreadyMigrated++;
      continue;
    }

    if (!root.startDateTime || !root.endDateTime) {
      summary.failures.push({
        rootActivityId: rootIdStr,
        reason: 'Root activity missing startDateTime or endDateTime',
      });
      continue;
    }

    let scheduleRule;
    try {
      scheduleRule = deriveScheduleRuleFromOccurrence(
        new Date(root.startDateTime),
        new Date(root.endDateTime),
        root.recurring as RecurringType,
        UK_TZ,
      );
    } catch (error) {
      summary.failures.push({
        rootActivityId: rootIdStr,
        reason:
          error instanceof Error
            ? error.message
            : 'Failed to derive schedule rule',
      });
      continue;
    }

    const chainActivities = await Activity.find({
      $or: [{ _id: rootId }, { originalActivityId: rootId }],
      deleted_at: null,
    })
      .select('_id startDateTime seriesId')
      .lean();

    if (chainActivities.some((a) => a.seriesId)) {
      summary.rootsSkippedAlreadyMigrated++;
      continue;
    }

    const startTimes = chainActivities
      .map((a) => a.startDateTime)
      .filter(Boolean)
      .map((d) => new Date(d as Date).getTime());

    if (startTimes.length === 0) {
      summary.failures.push({
        rootActivityId: rootIdStr,
        reason: 'No valid startDateTime values in activity chain',
      });
      continue;
    }

    const lastOccurrenceStartDateTime = new Date(Math.max(...startTimes));

    // Only cancelled roots represent an intentionally stopped series. Completed
    // roots with no future occurrences still need reconcile to spawn the next slot.
    const active = root.status !== ActivityStatus.CANCELLED;

    const seriesDoc = await RecurringSeries.create({
      hostId: root.hostId,
      recurring: root.recurring,
      scheduleRule,
      active,
      recurrenceStoppedAt: active ? null : new Date(),
      lastOccurrenceStartDateTime,
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
      migratedFromRootActivityId: rootId,
    });

    summary.seriesCreated++;

    const updateResult = await Activity.updateMany(
      {
        $or: [{ _id: rootId }, { originalActivityId: rootId }],
        deleted_at: null,
      },
      { $set: { seriesId: seriesDoc._id } },
    );

    summary.activitiesUpdated += updateResult.modifiedCount;
  }

  console.log('\n=== Migration summary ===');
  console.log(JSON.stringify(summary, null, 2));

  if (summary.failures.length > 0) {
    console.error(`\n${summary.failures.length} root(s) failed to migrate`);
    process.exitCode = 1;
  }

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error('Migration failed', error);
  process.exit(1);
});
