# Booking Payment Flow Design

## Recommended Flow: Charge Upfront, Hold in Escrow

### Why This Flow?

- ✅ Ensures member has funds available
- ✅ Better user experience (payment done upfront)
- ✅ Reduces risk of failed payments after approval
- ✅ Standard marketplace pattern (Airbnb, Uber, etc.)

### Flow Diagram

#### **FREE Activities:**

```
Member → Book Activity → Status: CONFIRMED (immediate)
Host → Receives notification
```

#### **PAID Activities:**

```
1. Member → Book Activity
   ├─ Charge member via Payment Intent
   ├─ Hold payment in platform account (escrow)
   ├─ Status: PENDING
   └─ Send emails (Member + Host)

2. Host → Approve/Decline

   IF APPROVED:
   ├─ Transfer payment to host (Stripe Connect)
   ├─ Status: CONFIRMED
   └─ Send confirmation email to member

   IF DECLINED:
   ├─ Refund payment to member
   ├─ Status: CANCELLED
   └─ Send cancellation email to member
```

## Implementation Plan

### Phase 1: Basic Booking (✅ COMPLETED)

- ✅ Booking schema with status
- ✅ Free activities: Direct confirmation
- ✅ Paid activities: Charge + Hold in escrow
- ✅ Status: PENDING → CONFIRMED/CANCELLED
- ✅ Email notifications
- ✅ Refund on decline

### Phase 2: Stripe Connect (Future - TODO)

**Current Status:** Payment is collected and held in platform account. Marked as TRANSFERRED but not actually transferred yet.

**To Implement:**

1. Host onboarding to Stripe Connect
2. Store `stripeConnectAccountId` in User schema
3. In `approveBooking()`, use `stripe.transfers.create()` to transfer funds
4. Platform fee deduction (e.g., 10% platform fee)

**Example Transfer Code:**

```typescript
const transfer = await this.stripe.transfers.create({
  amount: Math.round(booking.amount * 100 * 0.9), // 90% to host, 10% platform fee
  currency: 'usd',
  destination: host.stripeConnectAccountId,
  source_transaction: booking.stripeChargeId,
});
booking.stripeTransferId = transfer.id;
```

### Phase 3: Advanced (Future)

- Partial refunds
- Cancellation policies
- Dispute handling
- Booking modifications

## Database Schema

### Booking Schema

- `memberId`: Reference to User (member)
- `activityId`: Reference to Activity
- `hostId`: Reference to User (host)
- `status`: PENDING, CONFIRMED, CANCELLED
- `paymentIntentId`: Stripe Payment Intent ID
- `amount`: Booking amount
- `paymentStatus`: PENDING, PAID, REFUNDED, TRANSFERRED
- `stripeTransferId`: Transfer ID (when sent to host)
- `created_at`, `updated_at`, `deleted_at`

## API Endpoints

1. `POST /bookings` - Create booking (charge for paid activities)
2. `GET /bookings/member/my-bookings` - Get member's bookings
3. `GET /bookings/host/pending` - Get host's pending bookings
4. `PUT /bookings/:id/approve` - Host approves booking
5. `PUT /bookings/:id/decline` - Host declines booking (refund)
6. `GET /bookings/:id` - Get booking details

## Email Notifications

1. **Booking Created:**
   - Member: "Booking request sent"
   - Host: "New booking request"

2. **Booking Approved:**
   - Member: "Booking confirmed"

3. **Booking Declined:**
   - Member: "Booking declined, refund processed"
