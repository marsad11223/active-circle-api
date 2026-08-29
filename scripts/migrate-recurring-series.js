"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
require('dotenv').config();
const activity_schema_1 = require("../src/schemas/activity.schema");
const recurring_series_schema_1 = require("../src/schemas/recurring-series.schema");
const recurring_activity_1 = require("../src/utils/recurring-activity");
const uk_time_1 = require("../src/utils/uk-time");
async function main() {
    const uri = process.env.MONGO_URI;
    if (!uri) {
        console.error('MONGO_URI is required');
        process.exit(1);
    }
    await mongoose_1.default.connect(uri);
    const Activity = mongoose_1.default.model('Activity', activity_schema_1.ActivitySchema);
    const RecurringSeries = mongoose_1.default.model('RecurringSeries', recurring_series_schema_1.RecurringSeriesSchema);
    const summary = {
        seriesCreated: 0,
        activitiesUpdated: 0,
        rootsSkippedAlreadyMigrated: 0,
        failures: [],
    };
    const roots = await Activity.find({
        originalActivityId: null,
        recurring: {
            $in: [
                activity_schema_1.RecurringType.DAILY,
                activity_schema_1.RecurringType.WEEKLY,
                activity_schema_1.RecurringType.MONTHLY,
                activity_schema_1.RecurringType.YEARLY,
            ],
        },
        deleted_at: null,
    }).lean();
    console.log(`Found ${roots.length} legacy recurring root activities`);
    for (const root of roots) {
        const rootId = root._id;
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
            scheduleRule = (0, recurring_activity_1.deriveScheduleRuleFromOccurrence)(new Date(root.startDateTime), new Date(root.endDateTime), root.recurring, uk_time_1.UK_TZ);
        }
        catch (error) {
            summary.failures.push({
                rootActivityId: rootIdStr,
                reason: error instanceof Error
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
            .map((d) => new Date(d).getTime());
        if (startTimes.length === 0) {
            summary.failures.push({
                rootActivityId: rootIdStr,
                reason: 'No valid startDateTime values in activity chain',
            });
            continue;
        }
        const lastOccurrenceStartDateTime = new Date(Math.max(...startTimes));
        const active = root.status !== activity_schema_1.ActivityStatus.CANCELLED;
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
        const updateResult = await Activity.updateMany({
            $or: [{ _id: rootId }, { originalActivityId: rootId }],
            deleted_at: null,
        }, { $set: { seriesId: seriesDoc._id } });
        summary.activitiesUpdated += updateResult.modifiedCount;
    }
    console.log('\n=== Migration summary ===');
    console.log(JSON.stringify(summary, null, 2));
    if (summary.failures.length > 0) {
        console.error(`\n${summary.failures.length} root(s) failed to migrate`);
        process.exitCode = 1;
    }
    await mongoose_1.default.disconnect();
}
main().catch((error) => {
    console.error('Migration failed', error);
    process.exit(1);
});
//# sourceMappingURL=migrate-recurring-series.js.map