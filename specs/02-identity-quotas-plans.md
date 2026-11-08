# Spec 02 – Identity, quotas, and plans

**Goal:** turn the classifier into a product with plans: 3 scans for visitors, 5 scans for a free account, unlimited scans for Pro. All enforcement happens on the server.
**Depends on:** Spec 01.

## Plans

| | Visitor | Free account | Pro |
|---|---|---|---|
| Scans | 3 in total | 5 in total (separate from the visitor 3) | Unlimited |
| Stored history | No | No | Yes (Spec 03) |
| Batch upload | No | No | Yes (Spec 04) |
| Insights page | No | No | Yes (Spec 03) |

`lib/plans.ts` is the single source of truth for limits and features:

```ts
export const PLANS = {
  visitor: { scanLimit: 3, history: false, batch: false, insights: false },
  free:    { scanLimit: 5, history: false, batch: false, insights: false },
  pro:     { scanLimit: null, history: true, batch: true, insights: true },
} as const;
```

## Decisions

- **Visitors are tracked by a random id in an httpOnly cookie, and the count lives on the server.** The cookie holds only the id, so users cannot edit their count. Clearing cookies resets a visitor. Counting by IP is not used because shared networks would block real users. Supabase anonymous sign-ins are not used because visitors store nothing.
- **Email and password with Supabase Auth.** Email confirmation is enabled in Supabase, so sign-up ends with a "Check your email" message and the user logs in after confirming. If confirmation is turned off, sign-up signs the user in immediately.
- **Payments are mocked.** The demo checkout changes the plan in the database. No card data is collected, stored, or sent.
- **Failed analyses do not use quota.** One scan is consumed before the model call and refunded if the analysis fails.
- **Plan and quota are always read from the database on the server.** The client is never trusted.
- **Two Supabase keys with separate roles.** The publishable key is used only for Auth: sign-in, sign-out, session checks and refresh. The service role key performs every table read and write, and stays on the server.

## Environment and dependencies

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only, never `NEXT_PUBLIC_`).
- `@supabase/ssr` for cookie-based auth sessions.

## Database

Migrations are timestamped files in `supabase/migrations/`, applied with the Supabase CLI:

- `20261107230513_create_visitor_usage.sql` creates `visitor_usage` (visitor id, `scans_used`, timestamps) with row-level security enabled and no policies, so only the server can read or write it.
- `20261108111020_identity_and_quotas.sql` creates:
  - `profiles`: `id` (references `auth.users`), `plan` (`free` or `pro`), `scans_used`, `company`, `billing_email`, `pro_since`, `created_at`. Row-level security allows a user to read only their own row. There is no insert or update policy, so clients can never change a plan.
  - A trigger on `auth.users` that creates the profile for every new account.
  - Atomic quota functions, so parallel requests cannot overspend: `consume_visitor_scan(visitor, limit)`, `consume_user_scan(user, limit)` (a null limit means unlimited) and `refund_scan(visitor, user)`. Each returns whether the scan was allowed (refund returns nothing).
  - Execute rights on these functions are revoked from `public`, `anon` and `authenticated` and granted to `service_role` only.

## Server logic

**Identity** (`lib/auth/identity.ts`): `getAuthUser()` verifies the session with `supabase.auth.getUser()` (never `getSession`). `resolveIdentity()` loads the plan from `profiles` for a signed-in user, or reads the visitor cookie for everyone else.

**Visitor cookie** (`lib/auth/visitor.ts`): name `hdn_vid`, random UUID, `httpOnly`, `secure` in production, `sameSite: "lax"`, `path: "/"`, max age 1 year. It is set on the response of an analyze request from a new visitor, including when that request is refused for quota.

**`/api/analyze` flow (extends Spec 01):**

1. Look up the signed-in user, then rate limit: 60 requests per minute per account, or 20 per minute per IP for visitors.
2. Validate the file, before touching quota.
3. Resolve identity and plan. If a `batchId` is present, require Pro (Spec 04).
4. Consume one scan with the matching function. If it returns false, respond 403 `quota_exceeded` with `upgradeTo` inside the `error` object: `"account"` for a visitor, `"pro"` for a free account.
5. Classify. If classification fails, call `refund_scan` (a failed refund is logged and never masks the user's error) and return the error.
6. Respond with the Spec 01 payload plus `quota: { plan, used, limit, remaining }` (`limit` and `remaining` are null for Pro). The quota is read from the database after the scan. If that read fails, the verdict is still returned with `quota: null`.

**Other routes**

- `GET /api/me` returns `{ authenticated, plan, quota }` for the top bar meter. It works for visitors, reading `visitor_usage`.
- `POST /api/billing/upgrade` requires a session. The body `{ company, billingEmail }` is validated with zod (company 1 to 100 characters, a valid email). It sets `plan = 'pro'`, stores company and email, and keeps the original `pro_since`. Repeating the call is safe. It returns `{ plan: "pro" }`.
- `POST /api/billing/downgrade` is a demo action that sets the plan to `free` and keeps `scans_used`. It returns `{ plan: "free" }`.
- `requirePlan("pro")` (`lib/auth/require-plan.ts`) returns 401 `unauthorized` without a session and 403 `pro_required` for a non-Pro user. `planGate` is the same check for code that already has the identity.

**Proxy** (`proxy.ts`): refreshes the Supabase session on each request (except static assets and `/api/health`). `/account` and `/upgrade` redirect to `/login` without a session. `/history` and `/insights` are open to everyone and show an upsell to non-Pro users. Batch upload is a mode of the main page, not a page (Spec 04).

## UI

- **Quota meter** in the top bar, as a pill: "3 free scans left" (visitor), "5 scans left" (free), "Pro · unlimited" (Pro). It updates after each scan from the `quota` in the response.
- **Limit dialog** when a scan is refused for quota. For a visitor: "You've used your 3 free scans. Create a free account to unlock 5 more." with Create account and Sign in. For a free account: "You've used your 5 free scans. Upgrade to Pro for unlimited scans, history, and batch upload." with View Pro.
- **`/signup`, `/login`:** email and password with zod validation, inline errors and a show/hide password toggle. Sign-up needs at least 8 characters. A failed login always shows the same message, so it does not reveal which emails exist. Both redirect to `/` afterwards.
- **`/pricing`:** three plan cards from `lib/plans.ts`, with no table. Each card shows the scan limit and a feature list (icon plus text). Pro is the highlighted card (dark, with a "Recommended" badge and an "Upgrade to Pro" button).
- **`/upgrade` (demo checkout):** plan summary, company name and billing email fields, and the note "Demo checkout. No payment is taken and no card details are collected." The "Confirm upgrade" button leads to a success state with a link to the analyze page.
- **`/account`:** email, plan, scans used, "Sign out", and, for Pro accounts, a "Demo only: downgrade to Free" button.

## Security checklist

- The service role key is used only in server code and never has a `NEXT_PUBLIC_` prefix.
- Plan changes happen only through the server routes, never from the client.
- The quota functions are not callable with the publishable key (verify by calling one with it).
- All request bodies are validated with zod. No route returns another user's data.
- Emails, passwords and tokens are not logged.

## Tests

- `plans.ts`: shape, values, quota and label helpers.
- Quota decisions with mocked database results: visitor allowed, visitor blocked, free blocked, Pro unlimited, refund never throws.
- Identity: verified user, plan from the database, visitor cookie reuse and replacement.
- `/api/analyze`: 403 `quota_exceeded` with the right `upgradeTo`, refund after a failed classification, visitor cookie handling, per-account and per-IP rate limits.
- `/api/billing/upgrade` and `/downgrade`: 401 without a session, success with one, validation errors for a bad email.
- `/api/me`: visitor, signed-in user, database failure.
- `requirePlan` and `planGate`: visitor 401, free user 403, Pro allowed.

## Acceptance criteria

- [ ] In a fresh incognito window, scans 1 to 3 work and the 4th shows the sign-up prompt. Refreshing the page keeps the count.
- [ ] After sign-up and email confirmation, the meter shows 5 scans and the 6th shows the upgrade prompt.
- [ ] The demo checkout makes the plan Pro, the meter shows unlimited, and scans keep working.
- [ ] A failed model call (invalid key) does not reduce the remaining count.
- [ ] A signed-in user cannot change their own plan with the Supabase client (the update is denied).
- [ ] Calling `consume_user_scan` with the publishable key fails.
- [ ] Lint, tests and build pass in CI.
