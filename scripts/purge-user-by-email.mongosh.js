/**
 * Delete every database record owned by one account.
 *
 * Dry run (prints counts, changes nothing):
 *   mongosh "$MONGO_URI" --file scripts/purge-user-by-email.mongosh.js -- someone@example.com
 *
 * Delete:
 *   mongosh "$MONGO_URI" --file scripts/purge-user-by-email.mongosh.js -- someone@example.com --apply
 *
 * Or set EMAIL below and run the file with no arguments.
 * Set APPLY to true only when you want that saved email deleted.
 *
 * This removes MongoDB documents only. It does not cancel Stripe, Apple, or
 * Google subscriptions, and it does not delete Cloudinary images.
 */

const EMAIL = '';
const APPLY = false;

const argv = process.argv.slice(2);
const cliEmail = argv.find((arg) => arg.includes('@') && !arg.startsWith('-'));
const cliApply = argv.includes('--apply');

const email = (cliEmail || EMAIL).trim();
const apply = cliApply || (APPLY && !cliEmail);

if (!email || !email.includes('@')) {
  console.error(
    'Enter an email.\n' +
      '  mongosh "$MONGO_URI" --file scripts/purge-user-by-email.mongosh.js -- someone@example.com\n' +
      'Add --apply to delete. Without it, the script only prints what it would remove.',
  );
  quit(1);
}

const escapedEmail = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const emailQuery = { $regex: `^${escapedEmail}$`, $options: 'i' };

function count(collection, filter) {
  return db.getCollection(collection).countDocuments(filter);
}

function remove(collection, filter) {
  const result = db.getCollection(collection).deleteMany(filter);
  return result.deletedCount || 0;
}

const users = db.users.find({ email: emailQuery }).toArray();

console.log(`Database: ${db.getName()}`);
console.log(`Email: ${email}`);
console.log(`Mode: ${apply ? 'DELETE' : 'DRY RUN'}`);

if (users.length === 0) {
  console.log('No user found with that email. Nothing to delete.');
  quit(0);
}

const admins = users.filter((user) => user.role === 'superAdmin');
if (admins.length > 0) {
  console.error(
    'Refusing to delete a superAdmin account: ' +
      admins.map((user) => `${user.email} (${user._id})`).join(', '),
  );
  quit(1);
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

const activities = db.activities
  .find({ hostId: { $in: userIds } }, { _id: 1 })
  .toArray();
const activityIds = activities.map((activity) => activity._id);

const series = db.recurringseries
  .find({ hostId: { $in: userIds } }, { _id: 1 })
  .toArray();
const seriesIds = series.map((item) => item._id);

const bookings = db.bookings
  .find(
    {
      $or: [
        { memberId: { $in: userIds } },
        { hostId: { $in: userIds } },
        { activityId: { $in: activityIds } },
      ],
    },
    { _id: 1 },
  )
  .toArray();
const bookingIds = bookings.map((booking) => booking._id);

const ratingFilter = {
  $or: [
    { memberId: { $in: userIds } },
    { hostId: { $in: userIds } },
    { activityId: { $in: activityIds } },
    { bookingId: { $in: bookingIds } },
  ],
};
const messageFilter = {
  $or: [
    { senderId: { $in: userIds } },
    { receiverId: { $in: userIds } },
    { activityId: { $in: activityIds } },
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
  ['bookings', { _id: { $in: bookingIds } }],
  ['activities', { hostId: { $in: userIds } }],
  ['recurringseries', { hostId: { $in: userIds } }],
  ['subscriptions', subscriptionFilter],
  ['users', { _id: { $in: userIds } }],
];

console.log('\nRecords for this email:');
for (const [collection, filter] of plan) {
  console.log(`  ${collection}: ${count(collection, filter)}`);
}
if (activityIds.length > 0) {
  console.log(
    `  other users' favorite lists to update: ${count('users', favoriteFilter)}`,
  );
}
if (bookingIds.length > 0) {
  console.log(
    `  other hosts' payouts to unlink these bookings from: ${count('payouts', danglingPayoutBookingsFilter)}`,
  );
}

if (!apply) {
  console.log(
    '\nDry run only. Re-run with --apply to delete these records.',
  );
  quit(0);
}

console.log('\nDeleting...');

const deleted = {
  outbox_events: remove('outbox_events', outboxFilter),
  notification_tokens: remove('notification_tokens', tokenFilter),
  ratings: remove('ratings', ratingFilter),
  messages: remove('messages', messageFilter),
  payouts: remove('payouts', payoutFilter),
};

if (bookingIds.length > 0) {
  const unlinked = db.payouts.updateMany(danglingPayoutBookingsFilter, {
    $pull: { relatedBookings: { $in: bookingIds } },
  });
  deleted.payoutBookingLinksCleared = unlinked.modifiedCount || 0;
}

deleted.bookings = remove('bookings', { _id: { $in: bookingIds } });

if (activityIds.length > 0) {
  const unfavorited = db.users.updateMany(favoriteFilter, {
    $pull: { favoriteActivities: { $in: activityIds } },
  });
  deleted.favoriteListsUpdated = unfavorited.modifiedCount || 0;
}

deleted.activities = remove('activities', { hostId: { $in: userIds } });
deleted.recurringseries = remove('recurringseries', {
  hostId: { $in: userIds },
});
deleted.subscriptions = remove('subscriptions', subscriptionFilter);
deleted.users = remove('users', { _id: { $in: userIds } });

console.log('Deleted:');
for (const [collection, amount] of Object.entries(deleted)) {
  console.log(`  ${collection}: ${amount}`);
}
console.log(`Finished. ${email} has been removed from ${db.getName()}.`);
