/**
 * Repair migrated recurring data and backfill missing series links.
 *
 * Usage:
 *   npm run repair:recurring-series
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

type RepairSummary = {
  seriesReactivated: number;
  orphanSeriesCreated: number;
  activitiesLinked: number;
  failures: Array<{ activityId: string; reason: string }>;
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

  const summary: RepairSummary = {
    seriesReactivated: 0,
    orphanSeriesCreated: 0,
    activitiesLinked: 0,
    failures: [],
  };

  const reactivated = await RecurringSeries.updateMany(
    {
      active: false,
      migratedFromRootActivityId: { $exists: true, $ne: null },
    },
    {
      $set: {
        active: true,
        recurrenceStoppedAt: null,
        updatedAt: new Date(),
      },
    },
  );
  summary.seriesReactivated = reactivated.modifiedCount;

  const orphans = await Activity.find({
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
  }).lean();

  for (const orphan of orphans) {
    const orphanId = (orphan._id as Types.ObjectId).toString();

    if (orphan.originalActivityId) {
      const root = await Activity.findOne({
        _id: orphan.originalActivityId,
        deleted_at: null,
      }).lean();

      if (root?.seriesId) {
        await Activity.updateOne(
          { _id: orphan._id },
          { $set: { seriesId: root.seriesId } },
        );
        summary.activitiesLinked++;
        continue;
      }

      const chainMate = await Activity.findOne({
        originalActivityId: orphan.originalActivityId,
        seriesId: { $ne: null },
        deleted_at: null,
      }).lean();

      if (chainMate?.seriesId) {
        await Activity.updateOne(
          { _id: orphan._id },
          { $set: { seriesId: chainMate.seriesId } },
        );
        summary.activitiesLinked++;
        continue;
      }
    }

    if (!orphan.startDateTime || !orphan.endDateTime) {
      summary.failures.push({
        activityId: orphanId,
        reason: 'Orphan missing startDateTime or endDateTime',
      });
      continue;
    }

    try {
      const scheduleRule = deriveScheduleRuleFromOccurrence(
        new Date(orphan.startDateTime),
        new Date(orphan.endDateTime),
        orphan.recurring as RecurringType,
        UK_TZ,
      );

      const series = await RecurringSeries.create({
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
        migratedFromRootActivityId: orphan.originalActivityId ?? orphan._id,
      });

      await Activity.updateMany(
        {
          deleted_at: null,
          $or: [{ _id: orphan._id }, { originalActivityId: orphan._id }],
        },
        { $set: { seriesId: series._id } },
      );

      if (orphan.originalActivityId) {
        await Activity.updateOne(
          { _id: orphan._id },
          { $set: { seriesId: series._id } },
        );
      }

      summary.orphanSeriesCreated++;
      summary.activitiesLinked++;
    } catch (error) {
      summary.failures.push({
        activityId: orphanId,
        reason:
          error instanceof Error ? error.message : 'Failed to repair orphan',
      });
    }
  }

  console.log('\n=== Repair summary ===');
  console.log(JSON.stringify(summary, null, 2));

  if (summary.failures.length > 0) {
    process.exitCode = 1;
  }

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error('Repair failed', error);
  process.exit(1);
});
