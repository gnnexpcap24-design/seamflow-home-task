# Spec 02 – Identity, quotas, and plans

**Goal:** turn the classifier into a product with tiers: 3 free scans for visitors, 5 more after creating an account, then upgrade to Pro. Enforcement happens on the server.
**Depends on:** Spec 01 deployed.

## Plans at a glance

| | Visitor | Free account | Pro |
|---|---|---|---|
| Scans | 3 total | 5 total (separate from the visitor 3) | Unlimited (fair-use rate limit) |
| Stored history | No | No | Yes (Spec 03) |
| Batch upload | No | No | Yes (Spec 04) |
| Insights dashboard | No | No | Yes (Spec 03) |

`lib/plans.ts` is the single source of truth:

```ts
export const PLANS = {
  visitor: { scanLimit: 3, history: false, batch: false, insights: false },
  free:    { scanLimit: 5, history: false, batch: false, insights: false },
  pro:     { scanLimit: null, history: true, batch: true, insights: true },
} as const;
```

## Decisions (and why)

- **Visitors are tracked by a random ID in an httpOnly cookie, and the count lives on the server.** The cookie holds only the ID, so users cannot edit their count. Clearing cookies resets a visitor, which is an accepted tradeoff (later improvements could include a proof-of-work layer with tools like Cloudflare Turnstile or mCaptcha). Counting by IP alone is rejected because shared networks and offices would block real users, which is a risk for the demo. Supabase anonymous sign-ins are rejected because visitors store nothing.
- **Email + password with Supabase Auth.** Turn email confirmation off in the Supabase dashboard for the demo so sign-up logs in immediately. README: production would require confirmation with custom SMTP.
- **Payments are mocked.** A demo checkout flips the plan in the database. No card data is collected, stored, or sent. README: Stripe would replace `/api/billing/upgrade` with a checkout session and a webhook.
- **Failed analyses do not use quota.** Consume before the model call, refund if it fails.
- **Plan and quota are always read from the database on the server.** The client is never trusted.

## Environment and dependencies

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or the publishable key), `SUPABASE_SERVICE_ROLE_KEY` (server only).
- New dependency (pre-approved): `@supabase/ssr` for cookie-based auth sessions in Next.js.

## Database (`supabase/migrations/002_identity.sql`)

```sql
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free','pro')),
  scans_used integer not null default 0,
  company text,
  billing_email text,
  pro_since timestamptz,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "read own profile" on public.profiles
  for select using (auth.uid() = id);
-- No update/insert policy: clients can never change their plan. Only the server (service role) writes.

create table public.visitor_usage (
  visitor_id uuid primary key,
  scans_used integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.visitor_usage enable row level security; -- no policies: service role only

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Atomic quota functions (no race conditions between parallel requests)
create function public.consume_visitor_scan(p_visitor uuid, p_limit int)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  insert into visitor_usage (visitor_id) values (p_visitor) on conflict do nothing;
  update visitor_usage set scans_used = scans_used + 1, updated_at = now()
    where visitor_id = p_visitor and scans_used < p_limit;
  return found;
end; $$;

create function public.consume_user_scan(p_user uuid, p_limit int) -- p_limit null = unlimited
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update profiles set scans_used = scans_used + 1
    where id = p_user and (p_limit is null or scans_used < p_limit);
  return found;
end; $$;

create function public.refund_scan(p_visitor uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is not null then
    update profiles set scans_used = greatest(scans_used - 1, 0) where id = p_user;
  elsif p_visitor is not null then
    update visitor_usage set scans_used = greatest(scans_used - 1, 0) where visitor_id = p_visitor;
  end if;
end; $$;

-- Security definer functions are callable through the API by default. Lock them to the server.
revoke execute on function public.consume_visitor_scan(uuid, int) from public, anon, authenticated;
revoke execute on function public.consume_user_scan(uuid, int) from public, anon, authenticated;
revoke execute on function public.refund_scan(uuid, uuid) from public, anon, authenticated;
```

Keep the SQL in the repo as a migration and apply it with the Supabase CLI (see the implementation notes below).

## Server logic

**Identity resolution** (`lib/auth/identity.ts`): create a server Supabase client with `@supabase/ssr`, call `supabase.auth.getUser()` (not `getSession`). If a user exists, load the profile with the service role client. If not, read or create the visitor cookie.

**Visitor cookie:** name `hdn_vid`, random UUID, `httpOnly`, `secure` in production, `sameSite: "lax"`, `path: "/"`, max age 1 year. Created in the route handler on the first analyze call.

**`/api/analyze` flow (extends Spec 01):**
1. Rate limit (per user id when signed in, else per IP).
2. Validate the file (before touching quota).
3. Resolve identity and plan.
4. Consume quota with the matching RPC. If it returns false: respond 403 `quota_exceeded` with `upgradeTo: "account"` (visitor) or `"pro"` (free).
5. Classify. If classification fails: call `refund_scan`, return the error.
6. Respond with the Spec 01 payload plus `quota: { plan, used, limit, remaining }` (`limit` and `remaining` are null for Pro).

**New error codes:** 403 `quota_exceeded` (body includes `upgradeTo`), 401 `unauthorized` (for protected routes).

**Other routes:**
- `GET /api/me` returns `{ authenticated, plan, quota }` for the top bar meter. Works for visitors (reads `visitor_usage`).
- `POST /api/billing/upgrade`: requires a session; body `{ company, billingEmail }` validated with zod; sets `plan = 'pro'`, `pro_since = now()`, stores company and email. Idempotent.
- `POST /api/billing/downgrade`: demo only, sets the plan back to `free`, so testers can retry the flow. Label it clearly as a demo action.
- `lib/auth/require-plan.ts`: `requirePlan("pro")` helper that returns 401 or 403 `pro_required`. Used by Specs 03 and 04.

**Middleware**: refresh the Supabase session on each request (`@supabase/ssr` pattern). Redirect rules: `/account` and `/upgrade` need a session; `/history` and `/insights` are pages that exist for everyone but show an upsell when the user is not Pro (they are built in Spec 03). Batch upload is a mode of the main page, not a page (Spec 04).

## UI

- **Quota meter in the top bar:** "3 free scans left" (visitor), "5 scans left" (free), "Pro · unlimited" (Pro). Updates after each scan using the `quota` in the response.
- **Sign-up prompt** (modal when `upgradeTo: "account"`): "You've used your 3 free scans. Create a free account to unlock 5 more." Buttons: Create account, Sign in.
- **Upgrade prompt** (modal when `upgradeTo: "pro"`): "You've used your 5 free scans. Upgrade to Pro for unlimited scans, history, and batch upload." Button: View Pro.
- **`/signup`, `/login`:** email + password (shadcn form, zod validation, inline errors, show/hide password). Redirect to `/` afterwards.
- **`/pricing`:** three plan cards from `lib/plans.ts` with a comparison table. "Pro" has the Upgrade button.
- **`/upgrade` (demo checkout):** plan summary, fields for company name and billing email, a visible note "Demo checkout. No payment is taken and no card details are collected." Button "Confirm upgrade". Success state with links to History and Batch.
- **`/account`:** email, plan, scans used, "Sign out", and the demo downgrade.

## Security checklist

- Service role key only in server code. Never `NEXT_PUBLIC_`.
- Plan changes only through the server route, never from the client.
- RPC functions revoked from `anon` and `authenticated` (verify by trying to call one with the anon key).
- Validate all bodies with zod. Never return other users' data.
- Do not log emails, passwords, or tokens.

## Tests

- `plans.ts` shape and values.
- Quota decision logic with mocked RPC results: visitor allowed, visitor blocked, free blocked, pro unlimited.
- `/api/analyze` returns 403 `quota_exceeded` with the right `upgradeTo`; a failed classification calls `refund_scan`.
- `/api/billing/upgrade`: 401 without a session, 200 with one, validation errors for a bad email.
- `requirePlan`: free user gets 403, pro gets through.

## Acceptance criteria

- [ ] Fresh incognito window: scans 1 to 3 work, the 4th shows the sign-up prompt. Refreshing the page keeps the count (it is server-side).
- [ ] Sign up with email + password: immediately signed in, meter shows 5 scans, the 6th shows the upgrade prompt.
- [ ] Demo checkout: the plan becomes Pro, the meter shows unlimited, scans keep working.
- [ ] A failed model call (invalid key) does not reduce the remaining count.
- [ ] A signed-in user cannot change their own plan with the Supabase client (the update is denied).
- [ ] Calling `consume_user_scan` with the anon key fails.
- [ ] Lint, tests, build green in CI. Deployed. Committed with a clear message.

## README notes to capture

Visitor tracking choice and its limits, why quota is consumed then refunded, mocked payments and what Stripe would replace, email confirmation off for the demo, and the plan matrix.

## Implementation notes and spec updates

Changes made while implementing this spec, and decisions taken with the product owner.

**Decisions**

- **Google sign-in was removed from this spec** (owner decision). It is described as a next step in `specs/05-next-steps.md`.
- **`visitor_usage` already existed.** It was created and pushed earlier by `20261107230513_create_visitor_usage.sql`, so the Spec 02 migration does not create it again.

**Deviations from the spec text**

- **Migrations** are timestamped CLI files, not `002_identity.sql`: `supabase/migrations/20261108111020_identity_and_quotas.sql` holds `profiles`, the trigger, the quota functions and the revokes. They are applied with `npx supabase db push --remote`, not the SQL editor. The migration also grants the three functions to `service_role` explicitly, so the revoke from `public` can never remove the server's access.
- **`proxy.ts` instead of middleware.** Next.js 16 renamed the middleware file. The session refresh and the `/account` and `/upgrade` redirect rules live in `proxy.ts` and `lib/supabase/proxy.ts`.
- **Env variable name:** `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is used instead of the anon key name. `SUPABASE_SERVICE_ROLE_KEY` is server only.
- **Supabase clients** live in `lib/supabase/` (`admin.ts`, `server.ts`, `browser.ts`, `proxy.ts`). The earlier plain `lib/supabase.ts` was removed.
- **Rate limit.** Signed-in users are limited per account (60 requests per minute), everyone else per IP (20 per minute). The signed-in user is looked up before the limiter runs because the limiter key needs the user id. File validation still runs before any quota is touched.
- **Error body.** `upgradeTo` is inside the `error` object: `{ "error": { "code": "quota_exceeded", "message": "...", "upgradeTo": "account" } }`.
- **Two extra error codes:** `invalid_request` (400, body failed zod validation) and `server_error` (500, a database call failed).
- **`quota` in the analyze response** is read from the database after the scan, because the quota functions return only a boolean. If that read fails after a successful scan, the verdict is still returned with `quota: null` and the client refreshes from `/api/me`.
- **Refund** never throws. A failed refund is logged and the user still gets the analysis error.
- **Upgrade success state** links to Analyze only. The History and Batch links arrive with Specs 03 and 04, because those pages do not exist yet. The pricing page carries a note that these features are being rolled out. The upgrade prompt text is the one specified, even though it mentions history and batch upload.
- **Idempotent upgrade** keeps the original `pro_since` and refreshes the company and billing email. The demo downgrade only sets the plan to free and keeps `scans_used`.
- **Forms:** passwords need at least 8 characters on sign-up. A failed login always shows the same message, so it does not reveal which emails exist. If email confirmation is turned on in Supabase, sign-up shows "Check your email" instead of signing in.
- **Extra files:** `components/quota-provider.tsx` (plan and quota shared with the top bar), `components/top-bar.tsx`, `components/quota-dialog.tsx`, `components/auth-form.tsx`, `components/upgrade-form.tsx`, `components/account-actions.tsx`, `lib/api-response.ts`, `lib/billing.ts`, `lib/quota.ts`, `lib/auth/visitor.ts`, `app/error.tsx` and `app/account/loading.tsx`.
- **Dependency:** `@supabase/ssr` (pre-approved). shadcn `input`, `label`, `dialog` and `table` were added.

**Not verified yet**

- The migration has not been applied from this environment, and no real Supabase project was used. Everything is covered by unit tests with mocked Supabase clients.
- None of the acceptance criteria is ticked. The security checks (the plan cannot be updated by a signed-in user, `consume_user_scan` fails with the publishable key) must be run manually after the migration is applied.

