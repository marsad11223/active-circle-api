# Quick Start - Booking Flow Test

## 🚀 Quick Setup

1. **Start Backend:**
   ```bash
   cd /Users/marsadghanvi/Desktop/Development/active-circle-api
   npm run start:dev
   ```

2. **Start Frontend:**
   ```bash
   cd testFE
   npm install  # If not already installed
   npm start
   ```

3. **Open Browser:**
   - Frontend will open at `http://localhost:3001` (or next available port)
   - Backend should be at `http://localhost:3000`

## 📝 Test Flow

### 1. Create Host Account
- Click "Sign Up"
- Select "Host"
- Fill details → Sign Up → Login

### 2. Create Activity (Host)
- Click "Create Activity" tab
- Form is **prefilled** with sample data
- Modify if needed or use as-is
- Click "Create Activity"

### 3. Create Member Account
- Logout
- Click "Sign Up"
- Select "Member"
- Fill details → Sign Up → Login

### 4. Book Activity (Member)
- Go to "Browse Activities"
- Click "Book" on any activity
- **Free activities**: Confirmed immediately
- **Paid activities**: Payment charged, held in escrow (PENDING status)

### 5. View Bookings
- **Member**: "My Bookings" tab - see all bookings with payment status
- **Host**: "Pending Bookings" tab - see bookings waiting for approval

### 6. Approve/Decline (Host)
- Go to "Pending Bookings"
- Click "✅ Approve" or "❌ Decline"
- **Approve**: Payment transferred to host, booking confirmed
- **Decline**: Payment refunded, booking cancelled

## 💰 Payment Escrow Testing

### Check Payment Status:
- **After Booking (Paid Activity)**:
  - Status: PENDING
  - Payment Status: PAID
  - Message: "💰 Payment is held in escrow"

- **After Host Approves**:
  - Status: CONFIRMED
  - Payment Status: TRANSFERRED
  - Message: "✅ Payment transferred to host"

- **After Host Declines**:
  - Status: CANCELLED
  - Payment Status: REFUNDED
  - Message: "↩️ Payment refunded"

## ⚠️ Important Notes

1. **For Paid Activities**: Member needs `stripeCustomerId` in their account. This is typically set when they:
   - Subscribe to become a host
   - Add a payment method
   
   If you get "Please add a payment method" error, the member needs to have a Stripe customer ID first.

2. **Test Payment Method**: Currently using `pm_card_visa` as a test payment method. In production, use Stripe Elements.

3. **Check Stripe Dashboard**: 
   - View Payment Intents
   - See charges and refunds
   - Monitor escrow status

## 🎯 Features Tested

✅ Member/Host signup & login
✅ Activity creation (prefilled form)
✅ Browse activities
✅ Book free activities (immediate)
✅ Book paid activities (escrow)
✅ View bookings with payment status
✅ Host approve/decline bookings
✅ Payment escrow tracking

## 🐛 Troubleshooting

- **CORS errors**: Make sure backend has CORS enabled
- **API errors**: Check backend is running on port 3000
- **Payment errors**: Ensure member has `stripeCustomerId`
- **Activities not loading**: Check browser console for errors


