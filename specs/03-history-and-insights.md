# Spec 03 – Scan history, signed URLs, and insights (Pro)

**Goal:** Pro accounts keep a private history of their scans and see simple insights. Images stay private and are only shown through short-lived signed URLs.
**Depends on:** Specs 01 and 02 deployed (plans, `requirePlan`, service role client).

## Plans at a glance

| | Visitor | Free account | Pro |
|---|---|---|---|
| Scans | 3 total | 5 total | Unlimited |
| Stored history | No | No | Yes |
| Batch upload | No | No | Yes |
| Insights dashboard | No | No | Yes |

## Decisions (and why)

- **Only Pro scans are stored.** Visitors and free accounts are never stored, which matches the footer promise and keeps data minimal.
- **Private bucket plus signed URLs.** The database stores image paths, never URLs, because signed URLs expire. URLs are generated on demand in one batch call per page.
- **The verdict always comes first.** Saving is best-effort: if storage or the database fails, the user still gets the verdict, and the error is logged.
- **No chart library.** Insights use plain CSS or SVG bars (no new dependency).

## Database and storage (`supabase/migrations/003_scans.sql`)

```sql
create table public.scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  batch_id uuid,                       -- used by Spec 04
  file_name text not null,
  image_path text not null,            -- path in the bucket, never a URL
  verdict text not null check (verdict in ('hot_dog','not_hot_dog')),
  confidence numeric not null check (confidence >= 0 and confidence <= 1),
  reason text,
  flagged boolean not null default false,
  created_at timestamptz not null default now()
);
create index scans_user_created_idx on public.scans (user_id, created_at desc, id desc);
alter table public.scans enable row level security;
create policy "read own scans" on public.scans for select using (auth.uid() = user_id);
-- Writes happen only on the server with the service role key.
```

- Create a **private** storage bucket named `scans`. Add no public policies; only the server (service role) reads and writes.
- Object path: `{user_id}/{scan_id}.{ext}`, built on the server only.

## Saving a scan (extends `/api/analyze`)

After a successful classification, if the plan has `history: true`:
1. Generate `scanId` (uuid).
2. Upload the received (already compressed) image to `scans/{user_id}/{scanId}.{ext}` with the correct content type.
3. Insert the row (`file_name` sanitized, verdict, confidence, reason, optional `batch_id`).
4. Wrap steps 2 and 3 in try/catch. If the insert fails after the upload, delete the uploaded object. Log errors without image data.
5. Add `saved: boolean` and `scanId` (when saved) to the response.

Free accounts and visitors: skip all of this, `saved: false`.

## API

All routes call `requirePlan("pro")` and use the signed-in user's id from `getUser()`, never an id from the request.

**`GET /api/scans?limit=20&cursor=...&verdict=...`**
- Keyset pagination on `(created_at, id)` descending. Cursor is an opaque base64 string.
- Optional `verdict` filter. Limit capped at 50.
- Fetch one extra row to compute `nextCursor`.
- Create signed URLs for the page in a single `createSignedUrls(paths, 3600)` call.
- Response: `{ items: [{ id, fileName, verdict, confidence, reason, createdAt, flagged, thumbUrl }], nextCursor }`. `thumbUrl` is null if signing fails for that item.

**`DELETE /api/scans/:id`**
- Validate that `:id` is a uuid. Load the row filtered by `user_id`. If it does not exist, return 404 (same for other people's scans).
- Delete the storage object, then the row. Return 204.

**`POST /api/scans/:id/flag`**: toggles `flagged` ("this result was wrong") for the owner's scan. Returns the new value.

**`GET /api/stats`** (single SQL aggregate or RPC, scoped to the user):
```json
{ "total": 42, "hotDogs": 18, "notHotDogs": 24, "hotDogRate": 0.43,
  "avgConfidence": 0.91, "lowConfidence": 3, "flagged": 2,
  "perDay": [{ "date": "2026-11-07", "count": 6 }] }
```
`perDay` covers the last 14 days, including zero days (fill gaps in code).

**Retention**: constant `RETENTION_DAYS = 30` in `lib/plans.ts`. Add `delete_expired_scans()` (SQL or a protected route) that removes old rows and objects. UI and README must only claim a retention period that is actually implemented; if the cleanup is not scheduled, say "retention policy planned" instead.

## UI

**History page `/history`**
- Non-Pro: upsell card ("Scan history is a Pro feature") with a link to `/pricing`. Do not call the API.
- Pro: responsive grid or table. Each item: thumbnail (signed URL), verdict badge (icon + text), confidence, relative time, file name, delete button, flag button.
- "Load more" button using `nextCursor`. Verdict filter tabs.
- Delete asks for confirmation (shadcn AlertDialog) and updates the list optimistically with rollback on error.
- Empty state: explanation and a link to analyze an image. Loading: skeleton cards. Error: inline alert with retry.
- If an image fails to load because its signed URL expired, refetch that page once.

**Insights page `/insights`**
- Non-Pro: upsell card.
- Pro: stat cards (total scans, hot dog rate, average confidence, low-confidence count, flagged count) and a 14-day bar chart built with CSS or SVG, with an accessible text summary. Empty state when there are no scans.

**Top bar nav:** add History and Insights links (Batch comes in Spec 04). Update the footer note to: "Images are processed in memory. Pro accounts keep a private history that only you can see."

**Analyze page:** for Pro, show a small "Saved to history" indicator when `saved` is true, and a quiet "Could not save to history" note when false (the verdict still shows).

## Security checklist

- Every route checks plan and ownership. User B must never read, sign, or delete user A's data.
- Paths are constructed on the server from verified ids. Never accept a path from the client.
- Bucket stays private. A bare object URL without a signature must not work.
- Signed URL lifetime: 1 hour. Never store URLs in the database.
- Sanitize `file_name` (trim, limit length, strip path characters) and render it as text only.

## Tests

- Cursor encode/decode and pagination boundaries (exactly 20 items, 21 items, empty).
- Stats calculation as a pure function (rates, gap filling for `perDay`).
- `/api/scans`: 401 without a session, 403 for non-Pro, only own rows returned, `thumbUrl` null when signing fails.
- Delete: 404 for someone else's scan, removes object and row for the owner.
- Analyze route with a mocked storage failure still returns the verdict with `saved: false`.

## Acceptance criteria

- [ ] A Pro scan appears in `/history` with a working thumbnail. A free account scan does not appear and is not stored.
- [ ] Opening the raw storage path (no signature) fails. A signed URL works, then stops after expiry.
- [ ] With two Pro accounts, neither can see or delete the other's scans (check both the UI and direct API calls).
- [ ] Delete removes the row and the file.
- [ ] Pagination works: 20 per page, "Load more" fetches the next page without duplicates.
- [ ] Insights numbers match the history list.
- [ ] Break the storage upload on purpose: the verdict still shows and the user sees the soft "not saved" note.
- [ ] Lint, tests, build green in CI. Deployed. Committed with a clear message.

## README notes to capture

Why private storage and signed URLs, path-not-URL storage, best-effort saving, Pro-only storage and the privacy reasoning, retention status (implemented or planned), and what a production version would add (audit log, workspaces, SSO).
