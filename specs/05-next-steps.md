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

## 7. Server-side batch processing (background job queue)

Spec 04 runs the batch queue in the browser: the tab must stay open, and closing it loses the files that were not sent yet. A background job queue removes that limit and makes large batches reliable.

**Recommended tool:** a durable job platform such as Inngest (or Trigger.dev). Each image becomes its own job, with retries, backoff and a concurrency limit built in, and it integrates with Next.js on Vercel. A lighter alternative is Upstash QStash, an HTTP queue that calls a route of ours and retries on failure, with less workflow tooling. Check the current free-tier run and concurrency limits on the vendor's pricing page before choosing, because third-party comparisons disagree.

**Flow**

1. **Direct upload.** The browser asks `POST /api/batches` for one signed upload URL per image and uploads the files straight to a private Supabase Storage path (`{user_id}/{batch_id}/{item_id}`). Large files never pass through a Vercel function, so the 4.5 MB request limit no longer applies. The browser still compresses first to save upload time and model cost.
2. **Batch record.** The same request creates a `batches` row and one `batch_items` row per image (`queued`), then sends one job per item to the queue.
3. **Worker job (one per image).** It loads the image from storage, consumes quota, classifies the image, saves the scan to history and marks the item `done` or `failed` with an error code.
   - Retries with backoff on rate limits, server errors and malformed output, using the same rules as `classifyImage`. No retry for refusals or bad images.
   - Quota is consumed when the job starts and refunded if it ends in failure. Each item has an idempotency key, so a retried or duplicated job never charges twice.
   - A global concurrency limit protects the OpenAI rate limit, and a per-user limit (for example 3) stops one large batch from starving other users.
4. **Progress.** The page follows a batch with Supabase Realtime, or by polling `GET /api/batches/:id`. Progress survives closing the tab, and finished batches appear in History when the user comes back.
5. **Controls.** Retry failed items, cancel the remaining items, and delete a batch together with its files.

**Data model (new migration)**

- `batches`: `id`, `user_id`, `status`, `total`, `created_at`.
- `batch_items`: `id`, `batch_id`, `scan_id`, `file_name`, `status`, `error_code`, `attempts`.
- Row Level Security on both tables with a read-own-rows policy only. All writes go through the server.

**Security and limits**

- A signed upload URL only allows one specific path, and the bucket enforces the file size and allowed image types.
- Pro is checked in `POST /api/batches` and again inside each job. Never trust the user id in a job payload without checking that it owns the batch.
- Cap the number of files per batch, as Spec 04 does.
- Failed or abandoned uploads (files with no matching item) need a cleanup, which fits with the retention cleanup in item 6.

**Tests**

- The job marks an item done, failed after exhausted retries, or skipped when canceled.
- A retried job does not consume quota twice.
- A user cannot read, cancel or retry another user's batch.
- The progress endpoint returns correct counts for mixed states.

**Acceptance**

- [ ] Starting a batch of 25 images and closing the tab still finishes the batch, and the results are in History.
- [ ] One failing image does not stop the others, and retrying it processes only that image.
- [ ] No more than the configured number of images are analysed at the same time.
- [ ] A free account cannot create a batch, and cannot upload to a Pro path.
