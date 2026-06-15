# Backend IAP API Contract

This document defines the REST API contract for **The Active Circle** native In-App Purchase subscriptions. The Expo mobile app implements against these endpoints. The backend currently supports Stripe web subscriptions — IAP runs in parallel without breaking web users.

## App identifiers

| Field | Value |
|-------|-------|
| iOS Bundle ID | `com.theactivecircle.app` |
| Android package | `com.theactivecircle.app` |
| App Store Connect App ID | `6768298207` |

## Product IDs (must match exactly)

| Tier | iOS | Android | Role after verify |
|------|-----|---------|-------------------|
| Standard monthly (£1.99, 1-month free trial) | `com.theactivecircle.app.standard.monthly` | `standard_monthly` | `standardMember` |
| Premium monthly (£5.99, 1-month free trial) | `com.theactivecircle.app.premium.monthly` | `premium_monthly` | `premiumMember` |

## Auth

All endpoints require `Authorization: Bearer <accessToken>` (existing JWT).

## Error shape

```json
{ "message": "string", "statusCode": number, "error": "optional string" }
```

---

## POST /subscriptions/verify

Verify a native store purchase and grant entitlement. Called immediately after in-app purchase.

### Request

```json
{
  "platform": "ios | android",
  "productId": "string",
  "transactionId": "string",
  "originalTransactionId": "string (iOS, optional)",
  "purchaseToken": "string (Android, required)",
  "packageName": "com.theactivecircle.app (Android, optional)",
  "signedTransaction": "string (iOS JWS, preferred)",
  "receiptData": "string (iOS legacy fallback, optional)"
}
```

### Validation

- **iOS:** App Store Server API — validate StoreKit 2 JWS / transaction ID
- **Android:** Google Play Developer API — `purchases.subscriptionsv2.get`
- Idempotent on `transactionId` + `platform`
- Unknown `productId` → `400`
- Store validation failure → `400` or `402` with `{ "message": "Purchase could not be verified" }`
- On success: upsert subscription record, set `user.role` + `user.hasActiveSubscription = true`

### Response 200

```json
{
  "statusCode": 200,
  "message": "Subscription verified",
  "data": {
    "entitlement": { /* SubscriptionEntitlement */ },
    "user": { /* same shape as GET /users/:id */ }
  }
}
```

---

## GET /subscriptions/me

Return authenticated user's current entitlement. Called on app startup, login, and after purchase.

### Response 200

```json
{
  "statusCode": 200,
  "data": {
    "isActive": true,
    "hasActiveSubscription": true,
    "tier": "basic | standard | premium",
    "source": "none | stripe | apple | google",
    "status": "none | active | trialing | grace_period | cancelled | expired | refunded | paused",
    "productId": "string",
    "platform": "ios | android | web",
    "transactionId": "string",
    "originalTransactionId": "string",
    "expiryDate": "ISO8601",
    "trialEndsAt": "ISO8601",
    "autoRenewing": true,
    "cancelledAt": "ISO8601",
    "managedByStore": true
  }
}
```

### Logic

- Resolve best active entitlement across Stripe + Apple + Google
- Highest tier wins if multiple active (`premium` > `standard`)
- Sync stale `user.role` / `user.hasActiveSubscription` on read if needed
- No subscription: `{ "isActive": false, "hasActiveSubscription": false, "tier": "basic", "source": "none", "status": "none", "managedByStore": false }`

---

## POST /subscriptions/restore

Restore purchases from the store. Called when user taps **Restore Purchases**.

### Request

```json
{
  "platform": "ios | android",
  "purchases": [
    {
      "productId": "string",
      "transactionId": "string",
      "originalTransactionId": "string",
      "purchaseToken": "string",
      "signedTransaction": "string"
    }
  ]
}
```

### Response 200

```json
{
  "statusCode": 200,
  "message": "Subscription restored | No active subscription found",
  "data": {
    "entitlement": { /* SubscriptionEntitlement */ },
    "user": { /* updated user */ },
    "restored": true
  }
}
```

---

## Webhooks (production)

### POST /webhooks/apple

App Store Server Notifications V2. Handle: `SUBSCRIBED`, `DID_RENEW`, `EXPIRED`, `REFUND`, `GRACE_PERIOD`, `DID_CHANGE_RENEWAL_STATUS`.

### POST /webhooks/google

Google Play RTDN via Pub/Sub. Handle: `SUBSCRIPTION_RENEWED`, `SUBSCRIPTION_CANCELED`, `SUBSCRIPTION_REVOKED`, `SUBSCRIPTION_EXPIRED`, `SUBSCRIPTION_IN_GRACE_PERIOD`.

---

## Existing endpoint (Stripe web only)

`DELETE /subscription/cancel` — keep for **Stripe web** subscribers only. Mobile IAP users cancel via App Store / Play Store; backend learns via webhooks.

---

## Database: `subscriptions`

```
userId, source, platform, productId, tier, status,
transactionId, originalTransactionId, purchaseToken,
expiryDate, trialEndsAt, autoRenewing, cancelledAt,
rawPayload, createdAt, updatedAt
```

**Indexes:** `{ userId, status }`, `{ originalTransactionId }` unique sparse, `{ purchaseToken }` unique sparse, `{ transactionId, platform }` unique.

---

## Environment variables

```bash
APPLE_IAP_KEY_ID=
APPLE_IAP_ISSUER_ID=
APPLE_IAP_PRIVATE_KEY=
APPLE_BUNDLE_ID=com.theactivecircle.app
APPLE_APP_ID=6768298207
GOOGLE_PLAY_PACKAGE_NAME=com.theactivecircle.app
GOOGLE_PLAY_SERVICE_ACCOUNT_JSON=
IAP_ENV=sandbox   # sandbox | production
```

---

## Mobile testing prerequisites

1. Deploy these endpoints to staging (`EXPO_PUBLIC_API_URL`)
2. Create subscription products in App Store Connect + Play Console
3. Build with EAS dev/preview profile (`expo-iap` requires native build, not Expo Go)
4. iOS: Sandbox tester in Settings → App Store → Sandbox Account
5. Android: Internal testing track + license testers
