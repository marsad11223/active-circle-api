# Lifetime free hosts

Some hosts can be granted **lifetime free** access: they can create activities as hosts with no Stripe subscription and no billing.

## How it works

- User document has a flag: `isLifetimeHost: true`.
- No `Subscription` record is created; they are treated like premium hosts (unlimited activities).
- Subscription API returns `hasSubscription: true`, `isLifetimeFree: true` for them.

## Adding a lifetime host (from the DB)

**Easiest: MongoDB (Compass or shell)**

1. Find the user (e.g. by email):
   ```js
   db.users.findOne({ email: "host@example.com" })
   ```
2. Update that user:
   ```js
   db.users.updateOne(
     { email: "host@example.com" },
     {
       $set: {
         isLifetimeHost: true,
         hasActiveSubscription: true,
         role: "premiumMember",
         grantRole: "host",
         updated_at: new Date()
       }
     }
   )
   ```

**By user ID:**

```js
db.users.updateOne(
  { _id: ObjectId("USER_OBJECT_ID_HERE") },
  {
    $set: {
      isLifetimeHost: true,
      hasActiveSubscription: true,
      role: "premiumMember",
      grantRole: "host",
      updated_at: new Date()
    }
  }
)
```

After this, the user can log in, switch to host mode, and create activities with no subscription or payment.

## Removing lifetime host

Set the flag and related fields back:

```js
db.users.updateOne(
  { _id: ObjectId("USER_OBJECT_ID_HERE") },
  {
    $set: {
      isLifetimeHost: false,
      hasActiveSubscription: false,
      role: "member",
      grantRole: "member",
      updated_at: new Date()
    }
  }
)
```
