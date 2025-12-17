# 🚀 Quick Setup Instructions

## 1. Create `.env` file

Create a file named `.env` in the `testFE` folder with this content:

```env
REACT_APP_API_URL=http://localhost:3000
REACT_APP_STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_publishable_key_here
```

Replace `pk_test_your_stripe_publishable_key_here` with your actual Stripe publishable key from the dashboard.

## 2. Make sure your backend is running

In the root directory (not testFE):
```bash
npm run start:dev
```

The backend should be running on `http://localhost:3000`

## 3. Enable CORS in your backend

Make sure your `main.ts` has CORS enabled:
```typescript
const app = await NestFactory.create(AppModule, { 
  cors: true,  // ✅ This is already set
  rawBody: true,
});
```

## 4. Start the frontend

```bash
cd testFE
npm start
```

The frontend will open at `http://localhost:3001`

## 5. Login and Test

1. **Login** with a host account (email/password from your database)
2. **View** the subscription status
3. **Click "Subscribe Now"**
4. **Use test card:** `4242 4242 4242 4242`
   - Expiry: Any future date (e.g., 12/25)
   - CVC: Any 3 digits (e.g., 123)
   - Postal: Any code (e.g., 12345)
5. **Submit payment** and watch it activate! 🎉

## Test Cards Cheat Sheet

- ✅ **Success:** 4242 4242 4242 4242
- ❌ **Decline:** 4000 0000 0000 0002
- 🔒 **3D Secure:** 4000 0025 0000 3155

## Troubleshooting

### "Network Error" or "Failed to fetch"
- Make sure backend is running on port 3000
- Check CORS is enabled
- Verify API_URL in `.env` is correct

### "Only hosts can subscribe"
- Login with a user that has `role: "host"` in the database
- Check your JWT token is valid

### Payment not completing
- Verify Stripe publishable key in `.env` is correct
- Check browser console for errors
- Make sure webhook is running: `stripe listen --forward-to localhost:3000/subscription/webhook`

## Features Included

✅ Beautiful, modern UI with gradient design  
✅ Login system with JWT authentication  
✅ Subscription creation with Stripe  
✅ Real-time subscription status display  
✅ Cancel subscription functionality  
✅ Stripe Elements for secure card input  
✅ Test card information displayed  
✅ Error and success notifications  
✅ Responsive design  

Enjoy testing! 🎉

