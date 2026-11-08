# Hot Dog or Not

A web app that takes an image and answers one question: is it a hot dog? Every answer is a definitive verdict (Hot Dog or Not Hot Dog) with a confidence score and a one-sentence reason. A vision model from OpenAI makes the call.

The app has three plans (visitor, free account, Pro), server-side quotas, a private scan history, an insights page and batch upload.

## Who it is for

- **Visitors** who want a quick, definitive answer for an image, without creating an account.
- **Pro users** who classify many images and need to keep the results, see how they break down over time, and export them.

## What a user can do

| | Visitor | Free account | Pro |
|---|---|---|---|
| Scans | 3 in total | 5 in total | Unlimited |
| Scan history | No | No | Yes |
| Batch upload (up to 25 images) | No | No | Yes |
| Insights page | No | No | Yes |

**Journey**

1. **Visitor.** Opens the app and uploads an image (drag and drop, click, paste or keyboard). The browser resizes it and the server classifies it. The result appears next to the upload, with the verdict, a confidence bar and the reason. After 3 scans the app asks the visitor to create an account.
2. **Free account.** Signs up with email and password and confirms the email address, then gets 5 more scans. After those, the app prompts an upgrade.
3. **Pro.** The demo checkout (`/upgrade`) switches the plan to Pro without taking any payment. Pro users get unlimited scans, a private history with thumbnails, an insights page with a 14-day chart, and a Batch mode on the main page that analyzes up to 25 images with per-file progress, retry and CSV export.

**Rules the app follows**

- The verdict is always one of two values. A confidence below 0.70 adds a "Low confidence" badge and does not change the verdict.
- A failure is never shown as a verdict. Unreadable, rejected or failed analyses show an error with a retry.
- A failed analysis does not use up quota.
- Hot Dog means a frankfurter-style sausage, in a bun or on its own. Corn dogs, bratwurst, other food and non-food are Not Hot Dog.

## Architecture

**Stack:** Next.js (App Router) and TypeScript, Tailwind CSS and shadcn/ui, OpenAI Responses API, Supabase (Auth, Postgres, Storage), Vitest, deployed on Vercel.

**What happens on one scan (`POST /api/analyze`)**

1. The browser validates the file (JPEG, PNG or WebP, up to 10 MB), resizes it to at most 1500 px, and re-encodes it as JPEG, targeting under 1 MB. This keeps requests under Vercel's 4.5 MB body limit.
2. The route handler applies the rate limit, then checks the file: type, magic bytes (a renamed PDF is rejected) and size (at most 4 MB).
3. It identifies the caller from the session cookie (account) or the `hdn_vid` cookie (visitor), and reads the plan from the database.
4. It consumes one scan with an atomic SQL function. If the plan limit is reached, it answers 403 `quota_exceeded`.
5. It sends the image to OpenAI as one base64 image with a strict JSON schema. The request has a 20 second timeout, and one retry after 500 ms on rate limits, server errors, connection errors or malformed output. A refusal or an unreadable image is never turned into a verdict.
6. On failure it refunds the scan. On success, Pro scans are saved to history on a best-effort basis: a failed save never blocks the verdict.
7. The response carries the verdict, confidence, reason, `saved` flag and the remaining quota.

**Data (Supabase)**

| Object | Purpose |
|---|---|
| `profiles` | One row per account: plan, scans used, billing details. Created by a trigger on sign-up. |
| `visitor_usage` | Scan counter per visitor cookie id. |
| `scans` | Pro history: verdict, confidence, reason, image path, flag, optional batch id. |
| Storage bucket `scans` | Private images, 4 MB limit, JPEG, PNG and WebP only. Shown through 1 hour signed URLs. |
| SQL functions | `consume_visitor_scan`, `consume_user_scan`, `refund_scan` (quota) and `scan_stats` (insights). |

**Security model**

- Two Supabase keys. The publishable key is public and used only for sign-in, sign-out and session checks. The service role key bypasses row-level security, stays on the server (`lib/supabase/admin.ts`), and performs every table read and write.
- Row-level security is on for every table. Users can read only their own `profiles` and `scans` rows. `visitor_usage` has no policy, so only the server can touch it. The quota and stats functions are callable only with the service role key.
- Plan and quota always come from the database. The client is never trusted, and Pro features are checked on the server, not only hidden in the UI.
- Visitors are tracked by a random id in an httpOnly cookie. The count lives on the server, so it cannot be edited.

**Code map**

| Path | Contents |
|---|---|
| `app/` | Pages (`/`, `/login`, `/signup`, `/pricing`, `/upgrade`, `/account`, `/history`, `/insights`) and `app/api/` route handlers |
| `proxy.ts` | Refreshes the auth session and redirects `/account` and `/upgrade` to login when signed out |
| `components/` | Own components. `components/ui/` is generated by shadcn/ui |
| `lib/analyze/` | Model call, schema, prompt, error codes, browser request helper |
| `lib/auth/`, `lib/quota.ts`, `lib/plans.ts` | Identity, plan gating, quota, plan limits (single source of truth) |
| `lib/scans/` | History storage, pagination cursor, stats |
| `lib/batch/` | Browser batch queue, CSV export, table filters |
| `supabase/migrations/` | Database schema, applied with the Supabase CLI |
| `specs/` | One spec per feature slice (01 to 04), plus next steps (05) |

**API**

| Endpoint | Purpose |
|---|---|
| `POST /api/analyze` | Classify one image. Optional `batchId` (Pro only) groups it with a batch |
| `GET /api/me` | Current plan and quota, for the top bar |
| `POST /api/billing/upgrade`, `POST /api/billing/downgrade` | Demo plan changes (signed in) |
| `GET /api/scans`, `DELETE /api/scans/:id`, `POST /api/scans/:id/flag` | History list (6 per page, cursor-based), delete, flag as wrong (Pro) |
| `GET /api/stats` | Insights numbers (Pro) |
| `GET /api/health` | Liveness check |

Errors use one shape: `{ "error": { "code", "message" } }`, with messages written for end users. The codes are listed in Spec 01.

## Run locally

Requirements: Node 22 (`nvm use` reads `.nvmrc`), a Supabase project, and an OpenAI API key.

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in:

   | Variable | Where to find it |
   |---|---|
   | `OPENAI_API_KEY` | OpenAI dashboard |
   | `OPENAI_VISION_MODEL` | Any vision-capable OpenAI model. Development used `gpt-5.4-nano` (low cost) |
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase, Project Settings, API |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase, Project Settings, API Keys |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase, Project Settings, API Keys (secret key). Server only, never prefix it with `NEXT_PUBLIC_` |

3. Apply the database migrations:

   ```
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push --remote --dry-run
   npx supabase db push --remote
   ```

4. In Supabase, Authentication: keep email confirmation on, and set the Site URL (and a redirect URL for `http://localhost:3000`).
5. `npm run dev` and open http://localhost:3000.

To try Pro features, sign up, then use the demo checkout at `/upgrade`.

**Commands:** `npm run dev`, `npm run lint`, `npm test`, `npm run build`.

## Testing and CI

Unit tests (Vitest) cover validation, the model client, quotas, identity, history storage, pagination, stats, the batch queue, CSV export and every API route. They mock OpenAI and Supabase and never call real services. GitHub Actions (`.github/workflows/ci.yml`) runs install, lint, tests and build on Node 22 for every push and pull request to `main`.

## Deploy (Vercel)

Import the repository and add the five environment variables above for all environments. Redeploy after changing a variable. In Supabase, set the Site URL to the deployed domain.

## Key decisions and tradeoffs

- **Compress in the browser.** Vercel rejects request bodies over 4.5 MB and this cannot be configured, so images are shrunk before upload and the server rejects anything over 4 MB.
- **One request per image.** Batch upload sends images one at a time, three concurrently, from a queue in the browser. Each image gets its own result and a failure stays isolated.
- **Quota is consumed, then refunded.** Counting happens in the database in one atomic step, so parallel requests cannot overspend, and a failed analysis costs nothing.
- **Visitors are tracked by cookie, not by IP.** IP counting would block people who share a network. The cost is that clearing cookies resets a visitor's 3 scans.
- **Images are stored only for Pro history.** Visitors and free accounts are never stored, which keeps stored data minimal. History is private to the account that created it.
- **Two Supabase keys with separate roles.** The public key handles sign-in only, and every data access goes through the server with the service role key.
- **Charts use the shadcn chart component (Recharts)** instead of hand-built SVG.

## Known limitations

- **Payments are mocked.** The demo checkout changes the plan in the database. No card data is collected, stored or sent.
- **The rate limiter is in memory.** Each server instance counts separately, and only `POST /api/analyze` is limited (20 requests per minute per IP for visitors, 60 per minute per account).
- **No automatic retention.** History is kept until the user deletes a scan.
- **Batch runs in the browser tab.** Closing the tab stops the files that were not sent yet. Finished scans are already saved.
- **Single model provider.** All classification goes through OpenAI, and accuracy has not been measured on a labeled image set.
- **Email uses Supabase's built-in sender** unless custom SMTP is configured. It is rate limited and not meant for production traffic.
- **No UI component tests.** Image compression needs a real canvas and is checked by hand.
- **Tailwind CSS is pinned to 4.1.18.** Version 4.3 failed to build on Node 20.14.

## Next steps

Listed from most to least important in [specs/05-next-steps.md](specs/05-next-steps.md): production authentication and email, a shared rate limiter with wider coverage, 30-day retention, real payments with Stripe, a model evaluation set, support for several model providers, a small custom model for cheap first-pass classification, server-side batch processing, stronger visitor quota protection, and Google sign-in.

## How AI tools were used

Development followed written specs (`specs/`) and the rules in `AGENTS.md`. An AI coding agent (Claude Code) implemented the specs in small slices, with unit tests for the logic, external services mocked, and lint, tests and build passing before each slice was considered done. All changes were reviewed and committed by a maintainer.
