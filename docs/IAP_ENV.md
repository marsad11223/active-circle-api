# In-App Purchase (IAP) Environment Variables

Add these alongside existing Stripe and MongoDB configuration.

## Apple App Store

| Variable | Description |
|----------|-------------|
| `APPLE_IAP_KEY_ID` | App Store Connect API key ID |
| `APPLE_IAP_ISSUER_ID` | App Store Connect issuer ID |
| `APPLE_IAP_PRIVATE_KEY` | `.p8` private key contents (use `\n` for newlines in env) |
| `APPLE_BUNDLE_ID` | `com.theactivecircle.app` |
| `APPLE_APP_ID` | `6768298207` |

**Apple root certificates (required for JWS verify):** The repo includes `certs/apple/*.cer` (from [Apple PKI](https://www.apple.com/certificateauthority/)). These are loaded at runtime for `SignedDataVerifier` — the npm package does **not** bundle them. If verify returns 400, check deploy logs for `Loaded N Apple root certificate(s)`.

**Sandbox vs production:** Set `IAP_ENV=sandbox` while testing with Xcode / sandbox Apple IDs. The API tries both Sandbox and Production JWS environments so TestFlight purchases still verify when `IAP_ENV=production` on Railway.

## Google Play

| Variable | Description |
|----------|-------------|
| `GOOGLE_PLAY_PACKAGE_NAME` | `com.theactivecircle.app` |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | Service account JSON string with Android Publisher API access |

## General

| Variable | Description |
|----------|-------------|
| `IAP_ENV` | `sandbox` or `production` — controls Apple verification environment |

## Free trial (all platforms)

All subscription tiers use a **1-month (30-day) free trial**:

| Platform | Where to configure |
|----------|-------------------|
| **Stripe (web)** | Backend sets `trial_period_days: 30` when the user adds a payment method |
| **Apple (iOS)** | App Store Connect → subscription → **1 month** introductory free trial on `standard.monthly` and `premium.monthly` |
| **Google (Android)** | Play Console → subscription → **1 month** free trial offer on `standard_monthly` and `premium_monthly` |

The API reads trial state from each store; Apple/Google trial length must match in the respective consoles.

## Example `.env` snippet

```bash
# Existing
MONGO_URI=mongodb://localhost:27017/active-circle
SECRET=your-jwt-secret
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID=price_...
STRIPE_PRICE_ID_STANDARD=price_...

# IAP (mobile)
APPLE_IAP_KEY_ID=XXXXXXXXXX
APPLE_IAP_ISSUER_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
APPLE_IAP_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIGT...\n-----END PRIVATE KEY-----"
APPLE_BUNDLE_ID=com.theactivecircle.app
APPLE_APP_ID=6768298207
GOOGLE_PLAY_PACKAGE_NAME=com.theactivecircle.app
GOOGLE_PLAY_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"..."}
IAP_ENV=sandbox
```

## Webhook URLs (production)

- Apple App Store Server Notifications V2 → `POST https://<api-host>/webhooks/apple`
- Google Play RTDN (Pub/Sub push) → `POST https://<api-host>/webhooks/google`

See [BACKEND_IAP_API_CONTRACT.md](./BACKEND_IAP_API_CONTRACT.md) for the full API contract.
