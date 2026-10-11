/**
 * Delete every database record owned by one account.
 *
 * Dry run against the copy database:
 *   npm run purge:user -- someone@example.com
 *
 * Delete on the copy:
 *   npm run purge:user -- someone@example.com --apply
 *
 * Delete on the database named in MONGO_URI (production, when that URI is activeCircle):
 *   npm run purge:user -- someone@example.com --apply --db activeCircle
 *
 * This removes MongoDB documents only. It does not cancel Stripe, Apple, or
 * Google subscriptions, and it does not delete Cloudinary images.
 */
import fs from 'fs';
import { MongoClient } from 'mongodb';

const DEFAULT_DATABASE = 'activeCircle_copy';

function readMongoUri() {
  if (process.env.MONGO_URI) {
    return process.env.MONGO_URI.trim();
  }
  const env = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8');
  const match = env.match(/^MONGO_URI\s*=\s*"([^"]+)"/m);
  if (!match) {
    throw new Error('MONGO_URI is missing from .env');
  }
  return match[1];
}

function withDatabase(uri, dbName) {
  return uri.replace(/^(mongodb(?:\+srv)?:\/\/[^/]+)\/[^/?]*/, `$1/${dbName}`);
}

function parseArgs(argv) {
  const email = argv.find((arg) => arg.includes('@') && !arg.startsWith('-'));
  const apply = argv.includes('--apply');
  const dbFlagIndex = argv.indexOf('--db');
  const database =
    dbFlagIndex >= 0 ? argv[dbFlagIndex + 1] : DEFAULT_DATABASE;
  return { email: email?.trim() ?? '', apply, database };
}

const { email, apply, database } = parseArgs(process.argv.slice(2));

if (!email || !email.includes('@')) {
  console.error(
    'Enter an email.\n' +
      '  npm run purge:user -- someone@example.com\n' +
      'Add --apply to delete. Without it, the script only prints what it would remove.\n' +
      `The default database is ${DEFAULT_DATABASE}. Pass --db activeCircle to use production.`,
  );
  process.exit(1);
}

if (!database || database.startsWith('-')) {
  console.error('Pass a database name after --db.');
  process.exit(1);
}

const escapedEmail = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const emailQuery = { $regex: `^${escapedEmail}$`, $options: 'i' };

async function main() {
const client = new MongoClient(withDatabase(readMongoUri(), database));

try {
  await client.connect();
  const db = client.db(database);

  const count = (collection, filter) =>
    db.collection(collection).countDocuments(filter);

  const users = await db.collection('users').find({ email: emailQuery }).toArray();

  console.log(`Database: ${db.databaseName}`);
  console.log(`Email: ${email}`);
  console.log(`Mode: ${apply ? 'DELETE' : 'DRY RUN'}`);

  if (users.length === 0) {
    console.log('No user found with that email. Nothing to delete.');
    return;
  }

  const admins = users.filter((user) => user.role === 'superAdmin');
  if (admins.length > 0) {
    console.error(
      'Refusing to delete a superAdmin account: ' +
        admins
          .map((user) => `${user.email} (${user._id})`)
          .join(', '),
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    'Matched users:\n' +
      users
        .map(
          (user) =>
            `  ${user._id}  ${user.email}  role=${user.role || 'member'}  name=${user.name || ''}`,
        )
        .join('\n'),
  );

  const userIds = users.map((user) => user._id);
  const userIdStrings = userIds.map((id) => id.toString());

  const activities = await db
    .collection('activities')
    .find({ hostId: { $in: userIds } }, { projection: { _id: 1 } })
    .toArray();
  const activityIds = activities.map((activity) => activity._id);

  const series = await db
    .collection('recurringseries')
    .find({ hostId: { $in: userIds } }, { projection: { _id: 1 } })
    .toArray();
  const seriesIds = series.map((item) => item._id);

  const bookingQuery = {
    $or: [
      { memberId: { $in: userIds } },
      { hostId: { $in: userIds } },
      ...(activityIds.length > 0 ? [{ activityId: { $in: activityIds } }] : []),
    ],
  };
  const bookings = await db
    .collection('bookings')
    .find(bookingQuery, { projection: { _id: 1 } })
    .toArray();
  const bookingIds = bookings.map((booking) => booking._id);

  const ratingFilter = {
    $or: [
      { memberId: { $in: userIds } },
      { hostId: { $in: userIds } },
      ...(activityIds.length > 0 ? [{ activityId: { $in: activityIds } }] : []),
      ...(bookingIds.length > 0 ? [{ bookingId: { $in: bookingIds } }] : []),
    ],
  };
  const messageFilter = {
    $or: [
      { senderId: { $in: userIds } },
      { receiverId: { $in: userIds } },
      ...(activityIds.length > 0 ? [{ activityId: { $in: activityIds } }] : []),
    ],
  };
  const payoutFilter = { hostId: { $in: userIds } };
  const subscriptionFilter = { userId: { $in: userIds } };
  const tokenFilter = { userId: { $in: [...userIdStrings, ...userIds] } };
  const entityIds = [...userIds, ...activityIds, ...seriesIds, ...bookingIds];
  const outboxFilter = {
    $or: [
      { recipientEmail: emailQuery },
      { entityId: { $in: entityIds } },
      ...userIdStrings.map((id) => ({
        idempotencyKey: { $regex: `:${id}$` },
      })),
    ],
  };
  const favoriteFilter = {
    _id: { $nin: userIds },
    favoriteActivities: { $in: activityIds },
  };
  const danglingPayoutBookingsFilter = {
    hostId: { $nin: userIds },
    relatedBookings: { $in: bookingIds },
  };

  const plan = [
    ['outbox_events', outboxFilter],
    ['notification_tokens', tokenFilter],
    ['ratings', ratingFilter],
    ['messages', messageFilter],
    ['payouts', payoutFilter],
    ['bookings', bookingIds.length > 0 ? { _id: { $in: bookingIds } } : { _id: null }],
    ['activities', { hostId: { $in: userIds } }],
    ['recurringseries', { hostId: { $in: userIds } }],
    ['subscriptions', subscriptionFilter],
    ['users', { _id: { $in: userIds } }],
  ];

  console.log('\nRecords for this email:');
  for (const [collection, filter] of plan) {
    console.log(`  ${collection}: ${await count(collection, filter)}`);
  }
  if (activityIds.length > 0) {
    console.log(
      `  other users' favorite lists to update: ${await count('users', favoriteFilter)}`,
    );
  }
  if (bookingIds.length > 0) {
    console.log(
      `  other hosts' payouts to unlink these bookings from: ${await count('payouts', danglingPayoutBookingsFilter)}`,
    );
  }

  if (!apply) {
    console.log('\nDry run only. Re-run with --apply to delete these records.');
    return;
  }

  console.log('\nDeleting...');

  const remove = async (collection, filter) => {
    const result = await db.collection(collection).deleteMany(filter);
    return result.deletedCount || 0;
  };

  const deleted = {
    outbox_events: await remove('outbox_events', outboxFilter),
    notification_tokens: await remove('notification_tokens', tokenFilter),
    ratings: await remove('ratings', ratingFilter),
    messages: await remove('messages', messageFilter),
    payouts: await remove('payouts', payoutFilter),
  };

  if (bookingIds.length > 0) {
    const unlinked = await db.collection('payouts').updateMany(
      danglingPayoutBookingsFilter,
      { $pull: { relatedBookings: { $in: bookingIds } } },
    );
    deleted.payoutBookingLinksCleared = unlinked.modifiedCount || 0;
    deleted.bookings = await remove('bookings', { _id: { $in: bookingIds } });
  } else {
    deleted.bookings = 0;
  }

  if (activityIds.length > 0) {
    const unfavorited = await db.collection('users').updateMany(favoriteFilter, {
      $pull: { favoriteActivities: { $in: activityIds } },
    });
    deleted.favoriteListsUpdated = unfavorited.modifiedCount || 0;
  }

  deleted.activities = await remove('activities', { hostId: { $in: userIds } });
  deleted.recurringseries = await remove('recurringseries', {
    hostId: { $in: userIds },
  });
  deleted.subscriptions = await remove('subscriptions', subscriptionFilter);
  deleted.users = await remove('users', { _id: { $in: userIds } });

  console.log('Deleted:');
  for (const [collection, amount] of Object.entries(deleted)) {
    console.log(`  ${collection}: ${amount}`);
  }
  console.log(`Finished. ${email} has been removed from ${db.databaseName}.`);
} finally {
  await client.close();
}
}

await main();
