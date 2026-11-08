# Spec 05 – Next steps

Follow-up work after Specs 01 to 04, from most to least important. Items are independent.

## 1. Production authentication

Email confirmation with a custom SMTP provider (the built-in sender is heavily rate limited), a stronger password policy with leaked-password protection, and a password reset flow (`/forgot-password`, `/reset-password`). Optionally sign the user in automatically after confirming their email.

## 2. Shared rate limiter, wider coverage

The in-memory limiter is per serverless instance and only protects `POST /api/analyze`.

- Move the counters to a shared store such as Upstash Redis, so limits hold across instances.
- Apply it in `proxy.ts` to every API route, with a separate budget per group (reads, billing, analyze). Key by account when signed in, by IP otherwise. Keep `/api/health` unlimited.

## 3. Scan retention (30 days)

Pro history is kept until the user deletes it. Add a daily cleanup that removes scans older than 30 days.

- Delete image files through the Storage API first, then the rows, in batches. Never delete files with SQL: that removes only the metadata and leaves the files behind.
- Trigger it with a protected route (`GET /api/cron/cleanup`, requires `CRON_SECRET`) called by Vercel Cron. On the Hobby plan a job can run at most once a day, within about an hour of the scheduled time.
- Until this is live, the UI and README must not claim a retention period.

## 4. Real payments (Stripe)

Replace the mocked upgrade with a Stripe Checkout session. A signature-verified webhook is the only place that sets the plan, and cancellations or failed payments return the account to Free. Remove the demo upgrade and downgrade routes.

## 5. Model evaluation set

Before changing any model, measure the current one. Build a labeled set of hot dog, not hot dog and borderline images (corn dogs, bratwurst, toys, drawings), and a script that reports accuracy, confidence calibration, cost and latency per model. Opted-in "flagged as wrong" scans can add hard cases.

## 6. Multiple model providers

Today everything goes through OpenAI.

- Put classification behind one interface, so providers such as Claude and Gemini are interchangeable. The input is one image and the output is the same validated verdict, confidence and reason.
- Pick the provider and model with environment variables, and fall back to a second provider when the first one fails or times out.
- Always validate the output with the existing zod schema, because providers differ in how well they enforce structured output.
- Use the evaluation set (item 5) to choose the cheapest model that is accurate enough.

## 7. Small custom model

The task is a single yes/no question, so a small model can do most of the work much more cheaply and quickly than a general vision model.

- Train or fine-tune a compact image classifier on the evaluation data, and host it on a cheap inference endpoint.
- Run it first, and call the large model only when the small one is not confident (a cascade). This cuts cost and latency and keeps accuracy on hard images.
- Only train on images users agreed to share, and keep the large model as the fallback.

## 8. Background batch processing

The Spec 04 queue lives in the browser, so the tab must stay open. Move it to a durable job platform such as Inngest or Trigger.dev (Upstash QStash is a lighter option). Check each vendor's current free tier before choosing.

- The browser uploads files straight to private storage with signed URLs, which also removes the 4.5 MB request limit. The server creates `batches` and `batch_items` rows and queues one job per image.
- Each job consumes quota with an idempotency key (a retry never charges twice), classifies, saves to history, and has a concurrency limit and retries.
- Progress comes from Supabase Realtime or polling, and survives closing the tab. Add retry, cancel and delete for a batch, plus cleanup of abandoned uploads.

## 9. Stronger visitor quota protection

Clearing cookies resets a visitor's 3 scans. Add a proof-of-work or CAPTCHA layer, such as Cloudflare Turnstile, before a visitor's first scan.

## 10. Google sign-in

A "Continue with Google" button on `/login` and `/signup` using `signInWithOAuth`, plus an `app/auth/callback/route.ts` that exchanges the code for a session. Needs a Google Cloud OAuth client, the Google provider enabled in Supabase, and redirect URLs for local and production. The existing new-user trigger already creates the profile.
