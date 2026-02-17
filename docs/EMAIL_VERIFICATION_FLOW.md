# Email Verification (OTP) – Flow & Frontend Guide

OTP-based email verification is required after signup. Users cannot log in or start a subscription/trial until the email is verified. This reduces trial abuse (same person signing up with multiple emails).

---

## 1. Flow overview

```
Signup (POST /auth/signup)
    → User created with emailVerified: false
    → 6-digit OTP sent to email (valid 10 min)
    → Response: { data, requiresEmailVerification: true, email }
    → No access token returned

User enters OTP → Verify (POST /auth/verify-email)
    → If valid: emailVerified set to true, access token returned, welcome email sent
    → User can log in from here on

Login (POST /auth/login)
    → If emailVerified === false → 403 { code: 'EMAIL_NOT_VERIFIED', email }
    → Frontend shows verify screen with email prefilled

Subscription (POST /subscription/create)
    → If emailVerified === false → 400 "Please verify your email before starting a subscription."
```

---

## 2. API contracts

### 2.1 Signup

- **Request:** `POST /auth/signup`  
  Body: `{ name, email, password, address, role?, ... }` (same as before).

- **Response (201):**
  - `data`: user object (no password, no verificationOtpHash).
  - `requiresEmailVerification`: `true`.
  - `email`: string.

- **No `accessToken`** in response. Frontend should show the “Verify your email” screen and ask for the OTP.

---

### 2.2 Verify email

- **Request:** `POST /auth/verify-email`  
  Body:
  ```json
  { "email": "user@example.com", "otp": "123456" }
  ```
  - `otp`: exactly 6 digits (string).

- **Response (201):**
  - `data`: user object (emailVerified true).
  - `accessToken`: JWT. Use this to log the user in (no need to call login again).

- **Errors (400):**
  - User not found.
  - Email already verified.
  - OTP expired → ask user to use “Resend code”.
  - Too many attempts (5) → ask user to use “Resend code”.
  - Invalid OTP.

---

### 2.3 Resend OTP

- **Request:** `POST /auth/resend-email-otp`  
  Body:
  ```json
  { "email": "user@example.com" }
  ```

- **Response (201):**  
  `{ "message": "Verification code sent. Check your email." }`

- **Errors:**
  - 400: User not found / email already verified.
  - 400: “Please wait X seconds before requesting a new code.” (60 s cooldown).

---

### 2.4 Login

- **Request:** `POST /auth/login`  
  Body: `{ email, password }`.

- **Response (201):**  
  `{ data, accessToken }` (unchanged when email is verified).

- **Response (403) when email not verified:**
  ```json
  {
    "statusCode": 403,
    "code": "EMAIL_NOT_VERIFIED",
    "email": "user@example.com",
    "message": "Please verify your email before logging in."
  }
  ```
  Frontend should:
  - Show “Verify your email” screen.
  - Prefill `email` and optionally allow the user to enter OTP and call `POST /auth/verify-email`, or offer “Resend code”.

---

### 2.5 Subscription create

- **Request:** `POST /subscription/create`  
  Headers: `Authorization: Bearer <token>`.

- **Response (400) when email not verified:**  
  `"Please verify your email before starting a subscription."`

---

## 3. Frontend integration checklist

1. **After signup**
   - If response has `requiresEmailVerification === true`:
     - Do not store any token; do not redirect to “logged in” state.
     - Show a “Verify your email” screen.
     - Show the email (from `response.email`) and an OTP input (6 digits).
     - Buttons: “Verify” (calls `POST /auth/verify-email`), “Resend code” (calls `POST /auth/resend-email-otp` with that email).
   - On successful verify: store `accessToken` and user from `verify-email` response and redirect to app (same as login success).

2. **Resend code**
   - Disable “Resend code” for 60 seconds after click (or show countdown).
   - On 400 “Please wait X seconds”, show that message and enforce cooldown.

3. **Login**
   - On 403, read `response.data.code` (or `response.data.message?.code`).
   - If `code === 'EMAIL_NOT_VERIFIED'`:
     - Show “Verify your email” screen with `response.data.email` prefilled.
     - Same OTP flow as after signup (verify + resend).

4. **Subscription / trial**
   - If user taps “Start trial” (or similar) and API returns 400 “Please verify your email…”:
     - Redirect or show the verify-email screen and explain they must verify before starting a trial.

5. **Existing users (backward compatibility)**
   - Users created before this feature have no `emailVerified` field (or it may be undefined). The API treats “missing” as allowed for login and subscription. New users have `emailVerified: false` until they verify.

---

## 4. Backend behaviour summary

| Item              | Value / behaviour |
|-------------------|-------------------|
| OTP length        | 6 digits          |
| OTP expiry        | 10 minutes        |
| Max verify attempts | 5 per OTP      |
| Resend cooldown   | 60 seconds        |
| Welcome email     | Sent after successful verify (not on signup). |
