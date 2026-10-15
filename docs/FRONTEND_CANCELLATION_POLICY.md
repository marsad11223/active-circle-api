# Cancellation policy contract

Instructions for the mobile app and the web frontend. The API already enforces this policy. Do not add a new endpoint and do not recompute refunds on the server. Update copy, checkout, and the cancel confirmation in both apps so they match the API.

Remove every mention of a 48-hour window and a 50% refund. Those rules are gone.

## Policy

The clock is the activity start time, `activity.startDateTime` (UTC). Compare it with the current time.

`hoursUntilStart = (activity.startDateTime - now) / 1 hour`

### Before the host confirms the booking

`booking.status` is `pending`.

Cancelling releases the card hold in full. The activity price, service fee, and transaction fee are all released because the payment has not been captured.

### After the booking is confirmed, more than 24 hours before the activity

`booking.status` is `confirmed` and `hoursUntilStart > 24`.

- 100% of the activity price is refunded.
- 100% of The Active Circle service fee is refunded.
- The third-party payment transaction fee is not refunded.

### Within 24 hours of the activity

`booking.status` is `confirmed` and `hoursUntilStart <= 24`. This includes exactly 24 hours and any time after the activity has started.

- The activity price is not refunded.
- The service fee is not refunded.
- The transaction fee is not refunded.
- The member can still cancel. Keep the cancel action available. The host keeps the activity price.

### Host cancels the activity

Every confirmed member receives a full refund of the total they paid, including the activity price, the service fee, and the transaction fee. Pending card holds are released in full.

### Free activities

`booking.amount` is `0`. Cancellation is immediate and there is no payment.

## Terms and conditions

Replace the cancellation section with this text.

> **The Active Circle cancellation policy**
>
> **Before the host confirms your booking**
> You can cancel and the card hold is released in full. The activity price, The Active Circle service fee, and the third-party payment transaction fee are all released.
>
> **More than 24 hours before the activity**
> 100% of the activity price is refunded.
> 100% of The Active Circle service fee is refunded.
> The third-party payment transaction fee is not refunded.
>
> **Within 24 hours of the activity**
> No refund is issued. The activity price, the service fee, and the transaction fee are not refunded. You can still cancel the booking.
>
> **If the host cancels the activity**
> You receive a full refund of the total you paid, including the activity price, the service fee, and the transaction fee.
>
> Free activities can be cancelled at any time. There is no payment to refund.
>
> The 24-hour window is measured from the activity start time.

Show a short version of the same rules in these places:

- Checkout, under the payment total, before the member pays.
- The member cancel confirmation, with the amounts for that booking filled in.
- The host cancel confirmation: confirmed members receive the full amount they paid, including fees.

## Money fields

Booking amounts are in pounds.

| Field | Meaning |
| --- | --- |
| `amount` | Activity price. This is what the host receives. |
| `platformFee` | Service fee. 3% of the activity price, paid by the member on top. |
| `stripeFee` | Transaction fee already calculated for the card used. Display this stored value. Do not recompute it. The rate depends on the card country. |
| `totalAmountPaid` | `amount + platformFee + stripeFee`. This is what the member was charged. |

Checkout must show three lines, then the total:

- Activity price: `amount`
- Service fee: `platformFee`
- Transaction fee: `stripeFee`
- Total: `totalAmountPaid`

## Cancel confirmation preview

Compute this in the client for display only. The API is the source of truth when the member confirms.

- Free booking (`amount` is 0): no refund line. Confirm that the booking will be cancelled.
- `status` is `pending`: “Your card hold will be released in full.”
- `status` is `confirmed` and `hoursUntilStart > 24`:
  - Refund: `amount + platformFee`
  - Non-refundable transaction fee: `stripeFee`
- `status` is `confirmed` and `hoursUntilStart <= 24`:
  - Refund: £0.00
  - State that the activity price, service fee, and transaction fee are not refunded.

`cancelReason` is optional. Send it when the member enters one.

## Endpoints

Auth for both: `Authorization: Bearer <accessToken>`.

Error shape:

```json
{ "message": "string", "statusCode": 400, "error": "Bad Request" }
```

### PUT /bookings/member/:id/cancel

Member cancels their own booking. Only `pending` and `confirmed` bookings can be cancelled.

Request:

```json
{ "cancelReason": "optional string" }
```

Response: the updated booking.

| Case | `status` | `paymentStatus` | `stripeRefundId` |
| --- | --- | --- | --- |
| Confirmed, more than 24 hours before start | `cancelled` | `refunded` | set |
| Confirmed, within 24 hours of start | `cancelled` | stays `paid` | absent |
| Pending paid booking | `cancelled` | `refunded` | absent (the card hold was released) |
| Free booking | `cancelled` | unchanged / null | absent |

The refund for a confirmed booking more than 24 hours before the start is `amount + platformFee`. It is capped at `totalAmountPaid`. `stripeFee` is withheld.

`400` with message `This booking has already been refunded` when `paymentStatus` is already `refunded`.

### POST /activities/:id/cancel

Host cancels their activity. A super admin may pass `?hostId=` to cancel on behalf of a host.

Request:

```json
{ "cancelReason": "optional string" }
```

Response:

```json
{
  "message": "Activity cancelled successfully",
  "refundsProcessed": 0
}
```

`refundsProcessed` is the number of confirmed paid bookings refunded. Each of those refunds is the member’s `totalAmountPaid`.

## Host earnings

A booking cancelled within 24 hours stays `paymentStatus: "paid"` (or `transferred`). It counts toward host earnings after the activity status is `completed`. The host receives `amount` only. Fees stay with the platform and the payment processor.

A booking with `paymentStatus: "refunded"` does not count toward host earnings. That covers member cancellations more than 24 hours before the start, and host cancellations.

## Payment history

`GET /bookings/member/payment-history` omits cancelled bookings, including a within-24-hours cancellation that was still charged. Do not expect that charge to appear in member payment history.

Host transaction history includes that same booking once the activity is completed.

## Do not

- Do not disable cancellation inside 24 hours. The API accepts it and issues no refund.
- Do not tell the member they receive 100% of `totalAmountPaid` when they cancel more than 24 hours ahead. The transaction fee stays charged.
- Do not tell the member a host cancellation withholds the transaction fee. A host cancellation refunds the full total.
- Do not calculate the transaction fee in the client. Use `stripeFee` from the booking.
