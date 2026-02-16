# Frontend Integration: 3-Month Free Trial (Host Subscription)

This doc is for the **frontend developer** to integrate the host subscription flow with the **3-month free trial**. The API is already updated; the frontend needs to handle new response fields and one new flow.

---

## 1. What Changed (Summary)

- New host subscriptions get a **3-month free trial**. No charge at signup.
- User must **add a card** at signup (saved for future use). First charge happens **at the start of the 4th month**.
- API responses now include trial-related fields; one endpoint can return a different shape when the subscription is in trial.

---

## 2. API Changes

### 2.1 `POST /subscription/create` (same URL, same auth)

**Response (updated):**

| Field | Type | Description |
|-------|------|-------------|
| `subscriptionId` | string | Stripe subscription ID |
| `invoiceId` | string \| null | May be null for trial |
| `clientSecret` | string \| null | **Often null for trial** — used only when there is an immediate payment |
| `status` | string | `"trialing"` or `"incomplete"` (or `"active"` in edge cases) |
| **`requiresPaymentMethod`** | **boolean** | **New.** `true` = user must add card (no charge). Show “Add card” UI. |

**Frontend logic after create:**

- If `requiresPaymentMethod === true` **OR** (`status === 'trialing'` **and** no `clientSecret`):
  - Open your **card form** (Stripe Elements / Payment Element).
  - User enters card → create **Payment Method** with Stripe.js (do **not** confirm a PaymentIntent).
  - Send the **payment method ID** to `POST /subscription/pay-with-payment-method` (see below).
- If `clientSecret` is present:
  - Keep existing flow: show card form and **confirm PaymentIntent** with `clientSecret`, then call your existing “payment success” flow (which can still call `pay-with-payment-method` with the payment method ID if that’s what you do today).

So: **two paths** — (1) trial: no `clientSecret`, collect card and send `paymentMethodId` to backend; (2) non-trial: use `clientSecret` and confirm payment as before.

---

### 2.2 `POST /subscription/pay-with-payment-method` (same URL, same auth)

**Body:** `{ "paymentMethodId": "pm_xxx" }` (same as before).

**Response (updated):**

- **Trial (card saved, no charge):**  
  `{ "status": "trialing_activated", "message": "Trial started" }`  
  → User is now on trial and is a host. Show success: e.g. “You’re on a 3-month free trial. We’ll charge £5.99 at the start of month 4.”

- **Non-trial (invoice paid):**  
  `{ "status": "payment_processing", "invoiceId": "in_xxx" }`  
  → Keep existing “payment successful / activating” handling.

**Frontend:** Check `response.data.status === 'trialing_activated'` to show the trial-specific success message and refresh user/subscription state.

---

### 2.3 `GET /subscription/status` (same URL, same auth)

**Response (updated):** In addition to existing fields, the API now returns:

| Field | Type | Description |
|-------|------|-------------|
| **`isTrialing`** | **boolean** | `true` if subscription is in free trial |
| **`trialEnd`** | **string (ISO date) \| null** | When the trial ends (first charge date) |

Existing fields (`hasSubscription`, `status`, `currentPeriodStart`, `currentPeriodEnd`, `cancelAtPeriodEnd`) are unchanged.

**Frontend:**

- When `isTrialing === true`:
  - Show a clear “3-month free trial” state.
  - Show “Trial ends on [date]” / “First charge: £5.99 on [trialEnd]” using `trialEnd`.
- Allow **cancel** for both `status === 'active'` and `status === 'trialing'` (same `DELETE /subscription/cancel` as today).

---

## 3. Frontend Flow (Step by Step)

1. **User clicks “Become a host” / “Start subscription”**
   - Call `POST /subscription/create`.

2. **Handle create response**
   - If `requiresPaymentMethod` or (`status === 'trialing'` and no `clientSecret`):
     - Open card form.
     - **Trial flow:** Do **not** use a PaymentIntent. Collect card with Stripe.js, create a **Payment Method**, get `paymentMethod.id`.
     - Call `POST /subscription/pay-with-payment-method` with `{ paymentMethodId: paymentMethod.id }`.
     - On success, if `status === 'trialing_activated'` → show “3-month free trial started, we’ll charge on [date]”, refresh user + subscription status.
   - If `clientSecret` is present:
     - Keep current flow (confirm payment with `clientSecret`, then your existing success handling).

3. **Subscription status / dashboard**
   - Call `GET /subscription/status`.
   - If `isTrialing`:
     - Show “3-month free trial” and `trialEnd` (e.g. “First charge: £5.99 on [trialEnd]”).
   - Show “Cancel subscription” for both `active` and `trialing`.

4. **Pricing / marketing copy**
   - Update copy to: e.g. “3 months free, then £5.99/month” and “No charge today — we’ll charge at the start of month 4”.

---

## 4. Stripe.js: Two Ways to Use the Card

- **Trial (no immediate charge):**  
  `stripe.createPaymentMethod({ type: 'card', card: cardElement })` → send `paymentMethod.id` to `pay-with-payment-method`. Do **not** call `stripe.confirmCardPayment(clientSecret)`.

- **Immediate charge (when API returns clientSecret):**  
  `stripe.confirmCardPayment(clientSecret, { payment_method: { card: cardElement } })` — keep your existing flow. After success you can still call `pay-with-payment-method` if your backend expects it for that path.

So the only new part is: when there is **no** `clientSecret`, create a Payment Method and send its ID to the backend; backend will attach it and activate the trial.

---

## 5. Quick Checklist for Frontend

- [ ] After `POST /subscription/create`, check `requiresPaymentMethod` and `status === 'trialing'` with no `clientSecret` → show “Add card” (trial) flow.
- [ ] In trial flow: create Payment Method only, send `paymentMethodId` to `POST /subscription/pay-with-payment-method`.
- [ ] On pay-with-payment-method success, check `status === 'trialing_activated'` → show trial success message and refresh state.
- [ ] In subscription status UI, show trial state when `isTrialing === true` and display `trialEnd` (first charge date).
- [ ] Allow cancel when `status === 'trialing'` (same cancel endpoint).
- [ ] Update marketing/pricing copy to “3 months free, then £5.99/month” and “No charge today”.

---

## 6. Reference: testFE

A small test app (`testFE` in this repo) already implements this flow. Frontend dev can refer to:

- **SubscriptionManager.js** – create response handling, trial vs non-trial, calling pay-with-payment-method, status display.
- **CheckoutForm.js** – when there’s no `clientSecret`, it creates a Payment Method and passes the ID to the parent; parent calls pay-with-payment-method.

The **real app** should follow the same API contract and flow; only UI/UX and framework may differ.
