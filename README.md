# Hot Dog or Not (Enterprise Edition)

Upload an image and get a definitive verdict, "Hot Dog" or "Not Hot Dog", with a confidence score. Vision model: OpenAI. Stack: Next.js, TypeScript, Tailwind, shadcn/ui, Supabase (auth and Postgres), Vercel.

Specs live in `specs/`. This README covers Spec 01 (core classification) and Spec 02 (accounts, quotas and plans).

## Run locally

1. Use Node 22 (`nvm use`).
2. `cp .env.example .env.local` and fill in all five variables (`OPENAI_VISION_MODEL`, for example `gpt-5.4-nano`). `SUPABASE_SERVICE_ROLE_KEY` is server only and must never get a `NEXT_PUBLIC_` prefix.
3. `npm install && npm run dev`, then open http://localhost:3000.

Commands: `npm run lint`, `npm test`, `npm run build`. CI runs the same on every push and pull request.

## How it works

- The browser validates the file (JPEG, PNG or WebP, up to 10 MB), resizes it to at most 1500 px and re-encodes it as JPEG under about 1 MB.
- `POST /api/analyze` receives one image as `multipart/form-data`, checks it, and sends it to OpenAI as a base64 data URL with a strict JSON schema (verdict, confidence, reason).
- Images are processed in memory and never stored.

## Product decisions

- **Hot Dog** means a frankfurter-style sausage, in a bun or on its own, with any toppings. Corn dogs, bratwurst and other food are **Not Hot Dog**. Borderline cases get a one-line reason.
- The verdict is always definitive. Confidence below 0.70 adds a "Low confidence" badge but does not change the verdict.
- A failure is never shown as a verdict. Unreadable, rejected or failed analyses show an error with a retry.

## Design notes

- **Compression in the browser:** Vercel rejects request bodies over 4.5 MB, and that cannot be configured. Compressing first keeps normal phone photos well under the limit. The server rejects anything over 4 MB with a clear message.
- **Validation:** type, magic bytes (a renamed PDF is rejected) and size, in that order, before any model call.
- **Retries and errors:** one retry on rate limits, server errors and malformed model output. Refusals, bad-image errors and timeouts are not retried. Every error has a stable code and a user-friendly message with no stack traces or provider names. See `lib/analyze/errors.ts`.
- **Prompt-injection:** the prompt tells the model that text inside an image is content, not instructions.
- **Rate limit:** 20 requests per minute per IP, kept in memory. This is per serverless instance, so it is a basic guard, not a guarantee. A real deployment would use a shared store such as Redis.

## Plans, accounts and quotas

| | Visitor | Free account | Pro |
|---|---|---|---|
| Scans | 3 total | 5 total | Unlimited |

All limits live in `lib/plans.ts`. Enforcement is on the server, and plan and quota are always read from the database.

- **Visitors** are tracked by a random id in an httpOnly cookie (`hdn_vid`). The count lives on the server, so users cannot edit it. Clearing cookies resets a visitor, which is an accepted tradeoff. Counting by IP alone was rejected because shared networks would block real users.
- **Accounts** use Supabase Auth with email and password. For the demo, email confirmation is turned off in the Supabase dashboard so sign-up signs the user in immediately. Production would require confirmation with a custom SMTP provider.
- **Quota** is consumed atomically in the database before the model call and refunded if the analysis fails, so a failed scan costs nothing and parallel requests cannot overspend.
- **Payments are mocked.** The demo checkout flips the plan in the database. No card data is collected, stored or sent. Stripe would replace `/api/billing/upgrade` with a checkout session and a webhook. `/api/billing/downgrade` is a demo-only action.
- **Security:** clients can only read their own profile. Plan changes and quota functions are reachable only with the service role key on the server.

## Endpoints

- `POST /api/analyze` – field `file`. Returns the verdict and the remaining quota, or `{ "error": { "code", "message" } }`.
- `GET /api/me` – `{ authenticated, plan, quota }` for the top bar meter.
- `POST /api/billing/upgrade` – signed-in users only, demo checkout.
- `POST /api/billing/downgrade` – signed-in users only, demo action.
- `GET /api/health` – `{ "status": "ok", "time": "..." }`.

## Database migrations

Migrations are in `supabase/migrations/` and are applied with the Supabase CLI against the linked project:

```
npx supabase migration list --remote
npx supabase db push --remote --dry-run
npx supabase db push --remote
```

## Deploy (Vercel)

Import the repo and add the five variables from `.env.example` under Settings, Environment Variables (all environments). Redeploy after changing variables. In Supabase, turn off email confirmation (Authentication, Providers, Email) for the demo.

## Shortcuts and known gaps

- Tailwind is pinned to 4.1.18 (newer versions need a newer Node locally).
- The in-memory rate limiter is per instance (see above).
- The UI has no component tests. Compression logic that needs a real canvas is covered by manual testing.
- Payments are mocked (see above) and email confirmation is off for the demo.
- Spec decisions and deviations are recorded at the end of each spec file. Next steps are in `specs/05-next-steps.md`.
