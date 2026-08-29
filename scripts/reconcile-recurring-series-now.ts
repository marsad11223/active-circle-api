/**
 * Manually run recurring-series reconcile (same logic as the cron).
 *
 * Usage:
 *   npm run reconcile:recurring-series
 */
import mongoose, { Types } from 'mongoose';

// eslint-disable-next-line @typescript-eslint/no-require-imports
require('dotenv').config();

import { ActivitySchema, ActivityStatus } from '../src/schemas/activity.schema';
import { RecurringSeriesSchema } from '../src/schemas/recurring-series.schema';
import {
  buildOccurrenceEndDateTime,
  fastForwardToFuture,
} from '../src/utils/recurring-activity';

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

  const activeSeries = await RecurringSeries.find({ active: true }).lean();
  let created = 0;
  let alreadyExists = 0;
  let notApplicable = 0;
  let errors = 0;

  for (const series of activeSeries) {
    if (!series.lastOccurrenceStartDateTime) {
      errors++;
      console.warn(`Series ${series._id} missing lastOccurrenceStartDateTime`);
      continue;
    }

    const nextStart = fastForwardToFuture(
      series.recurring,
      series.scheduleRule,
      new Date(series.lastOccurrenceStartDateTime),
    );
    const nextEnd = buildOccurrenceEndDateTime(nextStart, series.scheduleRule);

    const existing = await Activity.findOne({
      seriesId: series._id,
      startDateTime: nextStart,
      deleted_at: null,
    }).lean();

    if (existing) {
      alreadyExists++;
      console.log(`[already_exists] ${series.title} -> ${nextStart.toISOString()}`);
      continue;
    }

    try {
      await Activity.create({
        hostId: series.hostId,
        title: series.title,
        description: series.description,
        category: series.category,
        location: series.location,
        coordinates: series.coordinates,
        difficultyLevel: series.difficultyLevel,
        startDateTime: nextStart,
        endDateTime: nextEnd,
        date: nextStart,
        maxParticipants: series.maxParticipants,
        price: series.price ?? 0,
        recurring: series.recurring,
        additionalInformation: series.additionalInformation,
        picture: series.picture,
        pictures: series.pictures?.length ? series.pictures : [series.picture],
        status: ActivityStatus.ACTIVE,
        seriesId: series._id,
        created_at: new Date(),
        updated_at: new Date(),
      });

      await RecurringSeries.updateOne(
        { _id: series._id },
        {
          $max: { lastOccurrenceStartDateTime: nextStart },
          $set: { updatedAt: new Date() },
        },
      );

      created++;
      console.log(`[created] ${series.title} -> ${nextStart.toISOString()}`);
    } catch (error) {
      errors++;
      console.error(
        `[error] ${series.title}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  console.log('\n=== Reconcile summary ===');
  console.log(
    JSON.stringify(
      {
        active: activeSeries.length,
        created,
        alreadyExists,
        notApplicable,
        errors,
      },
      null,
      2,
    ),
  );

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error('Reconcile failed', error);
  process.exit(1);
});
