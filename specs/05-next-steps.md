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

## 5. Shared rate limiter and wider coverage

The in-memory limiter is per serverless instance, and today it only protects `POST /api/analyze` (20 requests per minute per IP for visitors, 60 per minute per account).

- **Shared store:** move the counters to a shared store such as Redis (for example Upstash) so limits hold across instances and deployments.
- **Cover the other endpoints:** apply the limiter to every API route in `proxy.ts`, so one place enforces it. Give each group its own budget, for example a high one for reads (`/api/me`, `/api/scans`, `/api/stats`), a low one for billing routes, and keep the current one for `/api/analyze`. Key by account when signed in and by IP otherwise.
- **Why it is not done yet:** the other routes are cheap database reads or already require a session. Quotas and ownership checks protect the costly path, and Supabase Auth rate-limits sign-in and sign-up itself. An in-memory limiter in `proxy.ts` would be easy to get around, so wider coverage is worth doing together with the shared store.
- **Tests:** each group returns 429 with `Retry-After` once its budget is spent, groups do not share a budget, and `/api/health` stays unlimited.
- **Acceptance:**
  - [ ] Limits hold when requests are served by different instances.
  - [ ] Hammering `/api/me` or `/api/scans` returns 429, and normal browsing never does.

## 6. Scan retention cleanup

Pro scan history is currently kept until the user deletes a scan. Add an automatic cleanup that removes scans older than 30 days.

- **Constant:** `RETENTION_DAYS = 30` in `lib/plans.ts`.
- **Cleanup logic:** a function that finds scans older than the cutoff, deletes their image files through the Supabase Storage API, and only then deletes the rows. Process in batches (for example 100 scans per batch, a capped number of batches per run) so one run cannot time out.
- **Do not delete files with SQL.** Removing rows from `storage.objects` only removes the metadata. The actual files stay behind, still using space, with nothing pointing to them. Always go through the Storage API.
- **Trigger:** a protected route, `GET /api/cron/cleanup`, called once a day by a scheduler.
  - Vercel Cron works for this. Add a `crons` entry to `vercel.json` (for example `0 3 * * *`, UTC) and set a `CRON_SECRET` environment variable. Vercel then sends `Authorization: Bearer <CRON_SECRET>`.
  - The route must reject every request when `CRON_SECRET` is missing or does not match.
  - On the Hobby plan a cron job can run at most once per day, and the run can land anywhere within the scheduled hour. Both are fine for this job. Cron runs only against production, so test the route locally by calling it with the header.
- **Wording:** once this is deployed with `CRON_SECRET` set, the UI and README may state the 30-day retention. Until then they must say "retention policy planned".
- **Tests:**
  - The route returns 401 without the secret, with a wrong secret, and when `CRON_SECRET` is not configured.
  - Files are removed before rows, and the rows stay if file removal fails.
  - The cutoff is exactly 30 days.
  - Nothing is deleted when no scan has expired.
- **Acceptance:**
  - [ ] A scan older than 30 days is removed from the history and its file is gone from storage.
  - [ ] A recent scan is untouched.
  - [ ] A request without the secret is rejected.
