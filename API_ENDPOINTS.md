# API Endpoints Documentation

## Subscription Endpoints

### 1. Create Subscription
Creates a new monthly subscription for hosts (£5/month).

**Endpoint:** `POST /subscription/create`

**Authentication:** Required (JWT Bearer token)

**Access:** Host role only

**Request Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response (Success - 201):**
```json
{
  "subscriptionId": "sub_1234567890",
  "clientSecret": "pi_xxxxx_secret_xxxxx",
  "status": "incomplete"
}
```

**Response (Error - 400):**
```json
{
  "statusCode": 400,
  "message": "Only hosts can subscribe"
}
```
or
```json
{
  "statusCode": 400,
  "message": "User already has an active subscription"
}
```

**Usage:**
1. Call this endpoint to initiate a subscription
2. Use the returned `clientSecret` with Stripe.js on your frontend to complete the payment
3. After successful payment, the subscription status will be updated via webhook

---

### 2. Get Subscription Status
Retrieves the current subscription status for the authenticated user.

**Endpoint:** `GET /subscription/status`

**Authentication:** Required (JWT Bearer token)

**Request Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response (With Subscription):**
```json
{
  "hasSubscription": true,
  "status": "active",
  "currentPeriodStart": "2024-01-01T00:00:00.000Z",
  "currentPeriodEnd": "2024-02-01T00:00:00.000Z",
  "cancelAtPeriodEnd": false
}
```

**Response (No Subscription):**
```json
{
  "hasSubscription": false,
  "status": null
}
```

**Subscription Statuses:**
- `active` - Subscription is active and paid
- `past_due` - Payment failed, retrying
- `canceled` - Subscription has been canceled
- `unpaid` - All payment retries failed
- `incomplete` - Initial payment not completed
- `trialing` - In trial period (if configured)

---

### 3. Cancel Subscription
Cancels the user's subscription at the end of the current billing period.

**Endpoint:** `DELETE /subscription/cancel`

**Authentication:** Required (JWT Bearer token)

**Request Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response (Success):**
```json
{
  "message": "Subscription will be canceled at the end of the billing period",
  "cancelAt": "2024-02-01T00:00:00.000Z"
}
```

**Response (Error - 404):**
```json
{
  "statusCode": 404,
  "message": "No active subscription found"
}
```

**Note:** The subscription remains active until the end of the current billing period. The user will have access to host features until then.

---

### 4. Stripe Webhook
Handles Stripe webhook events to update subscription status automatically.

**Endpoint:** `POST /subscription/webhook`

**Authentication:** None (Stripe signature validation)

**Request Headers:**
```
stripe-signature: <stripe_signature>
```

**Request Body:** Raw Stripe event payload

**Response:**
```json
{
  "received": true
}
```

**Events Handled:**
- `customer.subscription.created` - New subscription created
- `customer.subscription.updated` - Subscription updated or renewed
- `customer.subscription.deleted` - Subscription ended
- `invoice.payment_succeeded` - Payment successful (activates subscription)
- `invoice.payment_failed` - Payment failed (marks subscription as past_due)

**Note:** This endpoint should be configured in your Stripe Dashboard webhooks section.

---

## User Schema Updates

The User model now includes:

```typescript
{
  stripeCustomerId: string;        // Stripe customer ID
  hasActiveSubscription: boolean;  // Quick access flag for subscription status
}
```

## Database Collections

### Subscription Collection
```typescript
{
  userId: ObjectId;               // Reference to User
  stripeCustomerId: string;       // Stripe customer ID
  stripeSubscriptionId: string;   // Stripe subscription ID
  stripePriceId: string;          // Stripe price ID
  status: SubscriptionStatus;     // Current status
  currentPeriodStart: Date;       // Billing period start
  currentPeriodEnd: Date;         // Billing period end
  cancelAtPeriodEnd: boolean;     // Cancel flag
  created_at: Date;
  updated_at: Date;
}
```

---

## Frontend Integration Example

### Creating a Subscription

```javascript
import { loadStripe } from '@stripe/stripe-js';

// Initialize Stripe
const stripe = await loadStripe('pk_test_your_publishable_key');

// Step 1: Create subscription intent
async function createSubscription() {
  const response = await fetch('http://your-api.com/subscription/create', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${userToken}`,
      'Content-Type': 'application/json',
    },
  });

  const { clientSecret } = await response.json();
  return clientSecret;
}

// Step 2: Confirm payment
async function confirmPayment(clientSecret, cardElement) {
  const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
    payment_method: {
      card: cardElement,
      billing_details: {
        email: userEmail,
        name: userName,
      },
    },
  });

  if (error) {
    console.error('Payment failed:', error.message);
    return false;
  }

  if (paymentIntent.status === 'succeeded') {
    console.log('Subscription created successfully!');
    return true;
  }
}

// Usage
const clientSecret = await createSubscription();
const success = await confirmPayment(clientSecret, cardElement);
```

### Checking Subscription Status

```javascript
async function checkSubscriptionStatus() {
  const response = await fetch('http://your-api.com/subscription/status', {
    headers: {
      'Authorization': `Bearer ${userToken}`,
    },
  });

  const data = await response.json();
  
  if (data.hasSubscription && data.status === 'active') {
    console.log('User has active subscription');
    console.log('Next billing date:', data.currentPeriodEnd);
  } else {
    console.log('No active subscription');
  }
}
```

### Canceling Subscription

```javascript
async function cancelSubscription() {
  const response = await fetch('http://your-api.com/subscription/cancel', {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${userToken}`,
    },
  });

  const data = await response.json();
  console.log(data.message);
  console.log('Subscription will end on:', data.cancelAt);
}
```

---

## Testing

### Test Card Numbers (Stripe Test Mode)

**Successful Payment:**
- Card: `4242 4242 4242 4242`
- Expiry: Any future date
- CVC: Any 3 digits
- ZIP: Any valid code

**Payment Declined:**
- Card: `4000 0000 0000 0002`

**Requires Authentication (3D Secure):**
- Card: `4000 0025 0000 3155`

**Insufficient Funds:**
- Card: `4000 0000 0000 9995`

---

## Error Codes

| Status Code | Description |
|------------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request (invalid data, already subscribed, etc.) |
| 401 | Unauthorized (invalid or missing token) |
| 403 | Forbidden (not a host) |
| 404 | Not Found (subscription not found) |
| 500 | Internal Server Error |

---

## Security Notes

1. **Never expose** `STRIPE_SECRET_KEY` to frontend
2. **Always validate** webhook signatures
3. **Use HTTPS** in production
4. **Store sensitive data** securely in environment variables
5. **Rate limit** API endpoints to prevent abuse
6. **Log** all subscription events for auditing

---

## Monitoring & Analytics

Track these metrics in Stripe Dashboard:
- New subscriptions per day/week/month
- Churn rate (canceled subscriptions)
- Monthly Recurring Revenue (MRR)
- Failed payment rate
- Average subscription lifetime

---

## Support & Troubleshooting

### Common Issues

**1. Webhook not receiving events:**
- Check webhook URL is publicly accessible
- Verify webhook secret is correct
- Check Stripe logs for delivery attempts

**2. Payment fails:**
- Ensure card has sufficient funds
- Check for 3D Secure requirements
- Verify Stripe account is not in restricted mode

**3. Subscription status not updating:**
- Check webhook is properly configured
- Verify database connection
- Check application logs for errors

**4. "Only hosts can subscribe" error:**
- Ensure user role is set to 'host'
- Check JWT token contains correct user data

For more help, check:
- [Stripe Documentation](https://stripe.com/docs)
- [Stripe Test Cards](https://stripe.com/docs/testing)
- Application logs

