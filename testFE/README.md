# Stripe Subscription Test Frontend

A simple React application to test the Stripe subscription integration with the Active Circle API.

## Setup

1. **Install dependencies:**
```bash
npm install
```

2. **Configure environment variables:**
Edit `.env` file and add your Stripe publishable key:
```env
REACT_APP_API_URL=http://localhost:3000
REACT_APP_STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_publishable_key_here
```

3. **Make sure your backend is running:**
```bash
# In the root directory
npm run start:dev
```

4. **Start the frontend:**
```bash
npm start
```

The app will open at `http://localhost:3001`

## Features

### ✅ Login System
- Login with your existing user credentials
- Automatically detects user role
- JWT token stored in localStorage

### ✅ Subscription Management
- **Create Subscription** - Start a new £5/month subscription
- **View Status** - See current subscription details
- **Cancel Subscription** - Cancel at end of billing period

### ✅ Stripe Payment Integration
- Secure card input using Stripe Elements
- Real-time validation
- Test card numbers included in UI

### ✅ Beautiful UI
- Modern gradient design
- Responsive layout
- Real-time status updates
- Error and success notifications

## Testing

### Test Cards (Stripe Test Mode):

1. **Successful Payment:**
   - Card: `4242 4242 4242 4242`
   - Any future expiry
   - Any 3-digit CVC
   - Any postal code

2. **Declined Payment:**
   - Card: `4000 0000 0000 0002`

3. **Requires 3D Secure:**
   - Card: `4000 0025 0000 3155`

## Usage Flow

1. **Login** with a host account
2. **View** subscription status (none if first time)
3. **Click "Subscribe Now"** to create subscription
4. **Enter test card** details in the checkout form
5. **Submit payment** - subscription activates immediately
6. **View active subscription** with billing details
7. **Cancel if needed** - remains active until period end

## Important Notes

- **Backend Required:** Make sure your API is running on `http://localhost:3000`
- **Host Role Only:** Only users with `role: 'host'` can create subscriptions
- **Test Mode:** Uses Stripe test keys - no real charges
- **CORS:** Backend must allow requests from `http://localhost:3001`

## Folder Structure

```
testFE/
├── public/
│   └── index.html
├── src/
│   ├── components/
│   │   ├── Login.js
│   │   ├── Login.css
│   │   ├── SubscriptionManager.js
│   │   ├── SubscriptionManager.css
│   │   ├── CheckoutForm.js
│   │   └── CheckoutForm.css
│   ├── App.js
│   ├── App.css
│   ├── index.js
│   └── index.css
├── .env
├── .gitignore
├── package.json
└── README.md
```

## API Endpoints Used

- `POST /auth/login` - User authentication
- `POST /subscription/create` - Create new subscription
- `GET /subscription/status` - Get subscription status
- `DELETE /subscription/cancel` - Cancel subscription

## Troubleshooting

### "Network Error"
- Ensure backend is running on port 3000
- Check CORS is enabled in backend

### "Only hosts can subscribe"
- Make sure you're logged in with a host account
- Check user role in database

### Payment not completing
- Verify Stripe publishable key in `.env`
- Check browser console for errors
- Ensure webhook is running (for status updates)

### Subscription status not updating
- Refresh the page after payment
- Check webhook is properly configured
- Wait a few seconds for Stripe webhook to process

## Development

Built with:
- React 18
- Stripe.js & Stripe React Elements
- Axios for API calls
- CSS for styling (no framework)

## License

For testing purposes only.

