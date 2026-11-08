# Spec 05 – Next steps

**Goal:** the follow-up work that builds on Specs 01 to 04. These items are independent. Each one can be picked up on its own once the earlier specs are deployed.
**Depends on:** Specs 01 to 04 deployed.

## 1. Google sign-in

Add a "Continue with Google" button to `/login` and `/signup`, using `supabase.auth.signInWithOAuth({ provider: "google" })`.

- **Setup before any code:** create a Google Cloud OAuth client, enable the Google provider in Supabase (Authentication, Providers), and add the redirect URLs for local development and the Vercel domain.
- **Callback:** add `app/auth/callback/route.ts` that exchanges the code for a session and redirects to `/`.
- **Profiles:** no change needed. The `on_auth_user_created` trigger creates the profile for Google users too.
- **Tests:** the callback route with a mocked Supabase client (success, missing code, exchange failure).
- **Acceptance:**
  - [ ] A new Google user lands signed in with the free plan and 5 scans.
  - [ ] An existing email account and a Google account with the same email behave as documented in the README.

## 2. Production authentication settings

- Turn email confirmation on, with a custom SMTP provider for delivery.
- Set a stronger password policy and enable leaked-password protection in Supabase.
- Add a password reset flow (`/forgot-password` and `/reset-password`).

## 3. Real payments with Stripe

Replace the mocked `/api/billing/upgrade` with a Stripe Checkout session, and move the plan change into a webhook handler.

- The webhook verifies the Stripe signature and is the only place that sets `plan = 'pro'`.
- Handle cancellation and failed payments by returning the account to the free plan.
- Remove the demo downgrade route.

## 4. Stronger protection for visitor quotas

Clearing cookies resets a visitor's 3 scans. Add a proof-of-work or CAPTCHA layer, such as Cloudflare Turnstile or mCaptcha, before a visitor's first scan.

## 5. Shared rate limiter

The in-memory limiter is per serverless instance. Move it to a shared store such as Redis (for example Upstash) so limits hold across instances and deployments.
