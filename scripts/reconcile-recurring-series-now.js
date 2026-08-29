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
async function main() {
    const uri = process.env.MONGO_URI;
    if (!uri) {
        console.error('MONGO_URI is required');
        process.exit(1);
    }
    await mongoose_1.default.connect(uri);
    const Activity = mongoose_1.default.model('Activity', activity_schema_1.ActivitySchema);
    const RecurringSeries = mongoose_1.default.model('RecurringSeries', recurring_series_schema_1.RecurringSeriesSchema);
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
        const nextStart = (0, recurring_activity_1.fastForwardToFuture)(series.recurring, series.scheduleRule, new Date(series.lastOccurrenceStartDateTime));
        const nextEnd = (0, recurring_activity_1.buildOccurrenceEndDateTime)(nextStart, series.scheduleRule);
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
                status: activity_schema_1.ActivityStatus.ACTIVE,
                seriesId: series._id,
                created_at: new Date(),
                updated_at: new Date(),
            });
            await RecurringSeries.updateOne({ _id: series._id }, {
                $max: { lastOccurrenceStartDateTime: nextStart },
                $set: { updatedAt: new Date() },
            });
            created++;
            console.log(`[created] ${series.title} -> ${nextStart.toISOString()}`);
        }
        catch (error) {
            errors++;
            console.error(`[error] ${series.title}:`, error instanceof Error ? error.message : error);
        }
    }
    console.log('\n=== Reconcile summary ===');
    console.log(JSON.stringify({
        active: activeSeries.length,
        created,
        alreadyExists,
        notApplicable,
        errors,
    }, null, 2));
    await mongoose_1.default.disconnect();
}
main().catch((error) => {
    console.error('Reconcile failed', error);
    process.exit(1);
});
//# sourceMappingURL=reconcile-recurring-series-now.js.map