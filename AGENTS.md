# AGENTS.md

## Cursor Cloud specific instructions

### Project overview
Active Circle (a.k.a. `how-drive-api`) is a NestJS 11 + MongoDB marketplace API for activities/events. It connects Hosts (who create activities) with Members (who browse, book, and pay). There is also a test React frontend in `testFE/` for manual Stripe/booking testing.

### Running the backend
- `npm run start:dev` — watch mode (default port from `.env` or `PORT` env var, typically 3000)
- The shell may have `PORT` set as an environment variable; unset it if you need the `.env` value: `unset PORT`
- Standard commands: `npm run build`, `npm run lint`, `npm test`

### Required environment variables
All secrets are injected automatically via Cloud Agent secrets (MONGO_URI, STRIPE_SECRET_KEY, RESEND_API_KEY, etc.). A `.env` file also exists as a fallback. Note that **injected env vars override `.env` values** — for example, `SKIP_EMAIL_VERIFICATION=false` is injected and overrides `.env`.

### Key startup caveats
- **MongoDB**: MongoDB 7.0 is installed on the VM. Start with: `mongod --dbpath /data/db --logpath /tmp/mongodb.log --fork`
- **Email verification**: The injected `SKIP_EMAIL_VERIFICATION=false` means users need email verification. To bypass during dev/testing, manually verify users via: `mongosh "$MONGO_URI" --eval 'db.users.updateOne({email: "<email>"}, {$set: {emailVerified: true}})'`
- **Stripe/Resend**: Services throw at startup if `STRIPE_SECRET_KEY` / `RESEND_API_KEY` are missing. Both are injected as secrets.
- **No automated tests exist** in the codebase (no `*.spec.ts` files, no `test/` directory).
- **ESLint** runs but reports many pre-existing warnings/errors (65 errors, 1824 warnings), all in `warn` rules.

### Test frontend (testFE/)
- Optional React app for manual Stripe/booking UI testing
- Install: `cd testFE && npm install`
- Run: `npm start` (port 3001)
- Requires `REACT_APP_STRIPE_PUBLISHABLE_KEY` and backend on port 3000
