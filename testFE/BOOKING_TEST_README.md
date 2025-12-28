# Booking Flow Test Frontend

This frontend allows you to test the complete booking flow including:
- Member signup/login
- Host signup/login
- Activity creation (with prefilled form data)
- Booking activities (free and paid)
- Host approve/decline bookings
- Payment escrow tracking

## Setup

1. Make sure your backend is running on `http://localhost:3000`
2. Install dependencies:
   ```bash
   cd testFE
   npm install
   ```

3. Create a `.env` file in the `testFE` directory:
   ```env
   REACT_APP_API_URL=http://localhost:3000
   REACT_APP_STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key
   ```

4. Start the frontend:
   ```bash
   npm start
   ```

## Testing Flow

### Step 1: Create a Host Account
1. Click "Sign Up"
2. Select "Host" as account type
3. Fill in name, email, and password
4. Click "Sign Up"
5. Login with the host account

### Step 2: Create an Activity (as Host)
1. After login, you'll see the "Booking Test" tab
2. Click "Create Activity" tab
3. The form is prefilled with sample data - you can modify it or use as-is
4. Fill in:
   - Title: e.g., "Yoga Session in Central Park"
   - Description: Activity description
   - Category: Comma-separated categories (e.g., "Fitness, Wellness")
   - Location: Activity location
   - Date & Time: When the activity will happen
   - Max Participants: Maximum number of participants
   - Price: Set to 0 for free activities, or enter amount for paid activities
   - Picture URL: URL to an image
5. Click "Create Activity"

### Step 3: Create a Member Account
1. Logout from host account
2. Click "Sign Up"
3. Select "Member" as account type
4. Fill in details and sign up
5. Login with the member account

### Step 4: Book an Activity (as Member)
1. Go to "Browse Activities" tab
2. You'll see all available activities
3. Click "Book" on any activity
   - For **free activities**: Booking is confirmed immediately
   - For **paid activities**: 
     - Payment is charged upfront
     - Payment is held in escrow (status: PENDING)
     - Booking status: PENDING (waiting for host approval)

### Step 5: View My Bookings (as Member)
1. Click "My Bookings" tab
2. You'll see all your bookings with:
   - Booking status (PENDING, CONFIRMED, CANCELLED)
   - Payment status (PENDING, PAID, REFUNDED, TRANSFERRED)
   - Escrow information
   - Payment Intent ID (for paid bookings)

### Step 6: Approve/Decline Booking (as Host)
1. Logout from member account
2. Login with host account
3. Click "Pending Bookings" tab
4. You'll see all pending bookings for your activities
5. For each booking:
   - **Approve**: 
     - Booking status changes to CONFIRMED
     - Payment status changes to TRANSFERRED (payment sent to host)
     - Member receives confirmation email
   - **Decline**: 
     - Booking status changes to CANCELLED
     - Payment status changes to REFUNDED (payment refunded to member)
     - Member receives cancellation email

## Payment Escrow Testing

### How to Verify Payment is in Escrow:

1. **After Member Books Paid Activity:**
   - Check "My Bookings" tab
   - Payment Status should show: **PAID**
   - You'll see: "💰 Payment is held in escrow"

2. **After Host Approves:**
   - Payment Status changes to: **TRANSFERRED**
   - Message: "✅ Payment transferred to host"

3. **After Host Declines:**
   - Payment Status changes to: **REFUNDED**
   - Message: "↩️ Payment refunded"

### Important Notes:

- **For Paid Activities**: The member needs to have a Stripe customer ID set up. This is typically done when they add a payment method or subscribe.
- **Test Payment Method**: Currently using `pm_card_visa` as a test payment method. In production, you'd use Stripe Elements to collect actual payment methods.
- **Stripe Dashboard**: Check your Stripe dashboard to see:
  - Payment Intents created
  - Charges held
  - Refunds processed
  - Transfers to host accounts (when Stripe Connect is implemented)

## Features

✅ Member signup/login
✅ Host signup/login  
✅ Activity creation with prefilled form
✅ Browse activities
✅ Book free activities (immediate confirmation)
✅ Book paid activities (payment held in escrow)
✅ View member bookings with payment status
✅ Host view pending bookings
✅ Host approve/decline bookings
✅ Payment escrow status tracking
✅ Real-time status updates

## Troubleshooting

1. **"Payment method is required" error:**
   - Make sure the member has a Stripe customer ID
   - This is usually set when they add a payment method or subscribe

2. **"Please add a payment method to your account" error:**
   - The member needs to have a `stripeCustomerId` in their user record
   - This can be set up through the subscription flow or payment method setup

3. **Activities not showing:**
   - Make sure backend is running
   - Check browser console for errors
   - Verify API_URL in .env file

4. **CORS errors:**
   - Make sure backend has CORS enabled (should be enabled by default)
   - Check backend is running on the correct port



