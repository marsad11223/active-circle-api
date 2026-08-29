'use strict';
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
const mongoose_1 = __importDefault(require('mongoose'));
require('dotenv').config();
const activity_schema_1 = require('../src/schemas/activity.schema');
const recurring_series_schema_1 = require('../src/schemas/recurring-series.schema');
const recurring_activity_1 = require('../src/utils/recurring-activity');
const uk_time_1 = require('../src/utils/uk-time');
async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI is required');
    process.exit(1);
  }
  await mongoose_1.default.connect(uri);
  const Activity = mongoose_1.default.model(
    'Activity',
    activity_schema_1.ActivitySchema,
  );
  const RecurringSeries = mongoose_1.default.model(
    'RecurringSeries',
    recurring_series_schema_1.RecurringSeriesSchema,
  );
  const summary = {
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
        activity_schema_1.RecurringType.DAILY,
        activity_schema_1.RecurringType.WEEKLY,
        activity_schema_1.RecurringType.MONTHLY,
        activity_schema_1.RecurringType.YEARLY,
      ],
    },
  }).lean();
  for (const orphan of orphans) {
    const orphanId = orphan._id.toString();
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
      const scheduleRule = (0,
      recurring_activity_1.deriveScheduleRuleFromOccurrence)(
        new Date(orphan.startDateTime),
        new Date(orphan.endDateTime),
        orphan.recurring,
        uk_time_1.UK_TZ,
      );
      const series = await RecurringSeries.create({
        hostId: orphan.hostId,
        recurring: orphan.recurring,
        scheduleRule,
        active: orphan.status !== activity_schema_1.ActivityStatus.CANCELLED,
        recurrenceStoppedAt:
          orphan.status === activity_schema_1.ActivityStatus.CANCELLED
            ? new Date()
            : null,
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
  await mongoose_1.default.disconnect();
}
main().catch((error) => {
  console.error('Repair failed', error);
  process.exit(1);
});
//# sourceMappingURL=repair-recurring-series.js.map
