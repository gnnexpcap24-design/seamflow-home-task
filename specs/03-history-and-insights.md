# Spec 03 – Scan history and insights (Pro)

**Goal:** Pro accounts keep a private history of their scans and see simple insights. Images stay private and are shown only through short-lived signed URLs.
**Depends on:** Specs 01 and 02 (plans, `requirePlan`, service role client).

## Decisions

- **Only Pro scans are stored.** Visitors and free accounts are never stored, which keeps stored data minimal.
- **Private bucket plus signed URLs.** The database stores image paths, never URLs, because signed URLs expire. URLs are generated on demand in one batch call per page.
- **The verdict always comes first.** Saving is best-effort: if storage or the database fails, the user still gets the verdict and the error is logged.
- **History belongs to the signed-in user** (`user_id` on each row), taken from the verified session and never from the request.
- **Charts use the shadcn/ui `chart` component, which wraps Recharts.** It is added with `npx shadcn@latest add chart`, which installs `recharts` and generates `components/ui/chart.tsx`. It reads the same CSS variables as the rest of the UI. No other chart library is used.
- **No retention in this spec.** Scans are kept until the user deletes them, so the UI and README do not claim a retention period. The cleanup is described in `specs/05-next-steps.md`.

## Database and storage

Migration `supabase/migrations/20261108120502_scans_history_and_storage.sql` creates:

- **`scans`:** `id`, `user_id` (references `auth.users`, cascade delete), `batch_id` (used by Spec 04), `file_name`, `image_path` (a bucket path, never a URL), `verdict`, `confidence` (0 to 1), `reason`, `flagged`, `created_at`. An index on `(user_id, created_at desc, id desc)` supports pagination. Row-level security allows a user to read only their own rows. There is no insert, update or delete policy: writes happen only on the server with the service role key.
- **A private storage bucket `scans`** with a 4 MB file size limit and JPEG, PNG and WebP only. It has no public policies, so only the server reads and writes it. Object paths are `{user_id}/{scan_id}.{ext}` (`jpg`, `png` or `webp`) and are built on the server only.
- **`scan_stats(p_user, p_days, p_low_confidence)`:** one aggregate query for insights, scoped to a user and callable only by the service role. Days are UTC dates.

## Saving a scan (extends `/api/analyze`)

After a successful classification, if the plan has `history: true`:

1. Generate `scanId` (a uuid).
2. Upload the received (already compressed) image to `scans/{user_id}/{scanId}.{ext}` with the correct content type.
3. Insert the row with the file name sanitized (path and control characters removed, at most 100 characters, `image` if empty), verdict, confidence, reason and the optional `batch_id`.
4. If the insert fails after the upload, delete the uploaded object. Errors are logged without image data.
5. Add `saved: boolean` and `scanId` (when saved) to the response.

Free accounts and visitors skip all of this and get `saved: false`.

## API

All routes call `requirePlan("pro")` and use the signed-in user's id, never an id from the request.

**`GET /api/scans?limit=6&cursor=...&verdict=...`**

- Keyset pagination on `(created_at, id)` descending. The cursor is an opaque base64 string that carries the timestamp as the database returns it (with microseconds) and is validated before it is used in a query.
- `limit` defaults to 6 and is capped at 50. An optional `verdict` filter accepts `hot_dog` or `not_hot_dog`. An invalid limit, verdict or cursor returns 400 `invalid_request`.
- One extra row is fetched to compute `nextCursor`. Signed URLs (1 hour) for the page are created in a single `createSignedUrls` call.
- Response: `{ items: [{ id, batchId, fileName, verdict, confidence, reason, createdAt, flagged, thumbUrl }], nextCursor }`. `thumbUrl` is null if signing fails for that item.

**`DELETE /api/scans/:id`**

- `:id` must be a uuid (otherwise 400). The row is loaded filtered by `user_id`. If it does not exist, or belongs to someone else, the response is 404 `not_found`.
- The storage object is deleted first, then the row. Response: 204. If the file cannot be deleted, the row is kept.

**`POST /api/scans/:id/flag`** toggles `flagged` ("this result was wrong") on the caller's scan and returns `{ flagged }`. Another user's scan returns 404.

**`GET /api/stats`**

```json
{ "total": 42, "hotDogs": 18, "notHotDogs": 24, "hotDogRate": 0.43,
  "avgConfidence": 0.91, "lowConfidence": 3, "flagged": 2,
  "perDay": [{ "date": "2026-11-07", "hotDogs": 2, "notHotDogs": 4 }] }
```

`perDay` covers the last 14 UTC days, including days without scans (filled in by the application). The day's total is the sum of the two counts. "Low confidence" counts scans below 0.70.

## UI

**History page `/history`**

- Non-Pro users see an upsell card ("Scan history is a Pro feature") with a link to `/pricing`, and the API is not called.
- Pro users see a title with the line "Your saved scans, kept private and visible only to you", verdict filter tabs (All, Hot Dog, Not Hot Dog) and a card grid. Each card shows a thumbnail (signed URL), verdict badge (icon and text), confidence, relative time, file name, one-line reason, a "Batch" badge when the scan belongs to a batch, a flag button and a delete button.
- 6 cards per page, with Previous and Next buttons and the current page number. The browser remembers the cursor of each page it has visited, which is what makes Previous possible. Changing the filter returns to page 1.
- Delete asks for confirmation (shadcn AlertDialog) and removes the card optimistically, with rollback on error. Afterwards the page is reloaded so it refills, or the list steps back if the page became empty.
- States: skeleton cards while loading, an inline alert with retry on error, and an empty state with a link to the analyze page.
- If an image fails to load because its signed URL expired, the current page is reloaded once to get new URLs. Cards without a URL show "Preview unavailable".

**Insights page `/insights`**

- Non-Pro users see an upsell card.
- Pro users see five stat cards (total scans, hot dog rate, average confidence, low-confidence count, flagged count) and one chart: a 14-day stacked bar chart of hot dogs and not hot dogs per day.
- The chart uses `ChartContainer` with a fixed height, a `ChartConfig` for the two series (`hotDogs` and `notHotDogs`), `ChartTooltip` and `ChartLegend`, and `accessibilityLayer`. Colors come from the theme tokens `--chart-1` (green, the same as the Hot Dog verdict) and `--chart-2` (neutral), referenced as `--color-hotDogs` and `--color-notHotDogs`. A text summary under the chart gives the totals for the 14 days. Color is never the only signal: the legend and tooltip use text labels.
- States: skeleton while loading, an inline alert with retry on error, and an empty state when there are no scans.

**Navigation and the analyze page:** the top bar has History and Insights links. On the analyze page, Pro accounts see "Saved to history" when `saved` is true and a quiet "Could not save to history" note when it is false. The verdict always shows. Free accounts and visitors see no note.

## Security checklist

- Every route checks the plan and ownership. One user must never read, sign, or delete another user's data.
- Paths are constructed on the server from verified ids. A path from the client is never accepted.
- The bucket stays private. A bare object URL without a signature must not work.
- Signed URLs last 1 hour and are never stored in the database.
- File names are sanitized and rendered as text only.

## Tests

- Cursor encoding and decoding, and pagination boundaries (exactly one page of items, one item more than a page, empty).
- Stats as a pure function: rates, rounding, gap filling for `perDay`, the daily hot dog and not hot dog split.
- File name sanitizing and relative time formatting.
- `/api/scans`: 401 without a session, 403 for non-Pro, only the caller's rows, the limit cap, invalid query values, `thumbUrl` null when signing fails.
- Delete: 404 for someone else's scan, file and row removed for the owner, the row kept when the file cannot be removed. Flag: toggle and 404.
- Saving: the upload and insert order, cleanup when the insert fails, and the analyze route still returning the verdict with `saved: false` when saving fails.
- The chart itself has no render test, because Recharts needs real layout. All data shaping lives in the pure stats function.

## Acceptance criteria

- [ ] A Pro scan appears in `/history` with a working thumbnail. A free account scan does not appear and is not stored.
- [ ] Opening the raw storage path (no signature) fails. A signed URL works, then stops after expiry.
- [ ] With two Pro accounts, neither can see or delete the other's scans (check both the UI and direct API calls).
- [ ] Delete removes the row and the file.
- [ ] Pagination works: 6 per page, Next and Previous move between pages without duplicates or gaps, and a full desktop page fits on screen without scrolling.
- [ ] Insights numbers match the history list, and the chart bars add up to the stat cards.
- [ ] The chart renders at 375 px and at desktop width, and its tooltip shows both counts for a day (by hover and by keyboard focus).
- [ ] With the storage upload broken on purpose, the verdict still shows and the user sees the "Could not save to history" note.
- [ ] Lint, tests and build pass in CI.
