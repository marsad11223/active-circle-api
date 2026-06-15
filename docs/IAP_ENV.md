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

## Google Play

| Variable | Description |
|----------|-------------|
| `GOOGLE_PLAY_PACKAGE_NAME` | `com.theactivecircle.app` |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | Service account JSON string with Android Publisher API access |

## General

| Variable | Description |
|----------|-------------|
| `IAP_ENV` | `sandbox` or `production` — controls Apple verification environment |

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
