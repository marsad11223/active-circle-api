# Stripe Subscription Setup Guide

## Overview

This application now supports monthly subscriptions for hosts at £5/month using Stripe.

## Environment Variables Required

Add these variables to your `.env` file:

```env
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_publishable_key
STRIPE_PRICE_ID=price_your_price_id_for_5_pounds_monthly
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
```

## Setup Steps

### 1. Create a Product and Price in Stripe Dashboard

1. Go to [Stripe Dashboard](https://dashboard.stripe.com/test/products)
2. Click "Add Product"
3. Fill in:
   - **Name**: "Host Monthly Subscription"
   - **Description**: "Monthly subscription for hosts"
   - **Pricing**:
     - Set as "Recurring"
     - Price: £5.00
     - Billing period: Monthly
4. Click "Save product"
5. Copy the **Price ID** (starts with `price_`) and add it to your `.env` as `STRIPE_PRICE_ID`

### 2. Get Your API Keys

1. Go to [API Keys](https://dashboard.stripe.com/test/apikeys)
2. Copy the **Secret key** (starts with `sk_test_`) → `STRIPE_SECRET_KEY`
3. Copy the **Publishable key** (starts with `pk_test_`) → `STRIPE_PUBLISHABLE_KEY`

### 3. Setup Webhook

1. Go to [Webhooks](https://dashboard.stripe.com/test/webhooks)
2. Click "Add endpoint"
3. Set endpoint URL: `https://your-domain.com/subscription/webhook`
4. Select events to listen for:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
5. Click "Add endpoint"
6. Copy the **Signing secret** (starts with `whsec_`) → `STRIPE_WEBHOOK_SECRET`

### 4. For Local Testing

Use Stripe CLI to forward webhooks to localhost:

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login to Stripe
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:3000/subscription/webhook

# Copy the webhook signing secret shown and add to .env
```

## API Endpoints

### 1. Create Subscription (Host only)

```http
POST /subscription/create
Authorization: Bearer <jwt-token>
```

**Response:**

```json
{
  "subscriptionId": "sub_xxxxx",
  "clientSecret": "pi_xxxxx_secret_xxxxx",
  "status": "incomplete"
}
```

Use the `clientSecret` on frontend with Stripe.js to complete payment.

### 2. Get Subscription Status

```http
GET /subscription/status
Authorization: Bearer <jwt-token>
```

**Response:**

```json
{
  "hasSubscription": true,
  "status": "active",
  "currentPeriodStart": "2024-01-01T00:00:00.000Z",
  "currentPeriodEnd": "2024-02-01T00:00:00.000Z",
  "cancelAtPeriodEnd": false
}
```

### 3. Cancel Subscription

```http
DELETE /subscription/cancel
Authorization: Bearer <jwt-token>
```

**Response:**

```json
{
  "message": "Subscription will be canceled at the end of the billing period",
  "cancelAt": "2024-02-01T00:00:00.000Z"
}
```

### 4. Webhook Endpoint (for Stripe)

```http
POST /subscription/webhook
Headers:
  stripe-signature: <stripe-signature>
```

This endpoint is called automatically by Stripe when subscription events occur.

## Frontend Integration Example

```javascript
// 1. Create subscription
const response = await fetch('/subscription/create', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${userToken}`,
  },
});

const { clientSecret } = await response.json();

// 2. Use Stripe.js to confirm payment
const stripe = Stripe('pk_test_your_publishable_key');
const { error } = await stripe.confirmCardPayment(clientSecret, {
  payment_method: {
    card: cardElement,
    billing_details: {
      email: userEmail,
    },
  },
});

if (error) {
  console.error(error.message);
} else {
  console.log('Subscription created successfully!');
}
```

## Subscription Status Flow

1. **incomplete** - Initial state, payment not yet confirmed
2. **active** - Payment successful, subscription active
3. **past_due** - Payment failed, retry in progress
4. **canceled** - Subscription canceled
5. **unpaid** - All payment retries failed
6. **trialing** - In trial period (if configured)

## User Schema Updates

The `User` schema now includes:

- `stripeCustomerId`: Stripe customer ID
- `hasActiveSubscription`: Boolean flag for quick access checks

## Subscription Schema

New `Subscription` collection tracks:

- User ID
- Stripe customer ID
- Stripe subscription ID
- Subscription status
- Current period dates
- Cancel status

## Testing

### Test Card Numbers (Stripe Test Mode)

- **Success**: 4242 4242 4242 4242
- **Decline**: 4000 0000 0000 0002
- **Requires authentication**: 4000 0025 0000 3155

Use any future expiry date, any 3-digit CVC, and any postal code.

## Webhook Events Handled

- `customer.subscription.created` - New subscription created
- `customer.subscription.updated` - Subscription updated (renewal, change)
- `customer.subscription.deleted` - Subscription canceled
- `invoice.payment_succeeded` - Payment successful
- `invoice.payment_failed` - Payment failed

## Security Notes

1. Always validate webhook signatures using `STRIPE_WEBHOOK_SECRET`
2. Never expose `STRIPE_SECRET_KEY` to frontend
3. Only `STRIPE_PUBLISHABLE_KEY` should be used in frontend code
4. Webhooks update subscription status automatically

## Monitoring

Monitor subscriptions in Stripe Dashboard:

- [Subscriptions](https://dashboard.stripe.com/test/subscriptions)
- [Payments](https://dashboard.stripe.com/test/payments)
- [Customers](https://dashboard.stripe.com/test/customers)
- [Logs](https://dashboard.stripe.com/test/logs)
