# Spec 04 – Batch upload (Pro)

**Goal:** Pro users can analyze many images in one go, see progress per file, retry failures, and export the results as CSV.
**Depends on:** Specs 01 to 03 deployed (plans, `requirePlan`, saving to history).

## Plans at a glance

| | Visitor | Free account | Pro |
|---|---|---|---|
| Scans | 3 total | 5 total | Unlimited |
| Stored history | No | No | Yes |
| Batch upload | No | No | Yes |
| Insights dashboard | No | No | Yes |

## Decisions (and why)

- **One request per image.** The platform limits each request body to 4.5 MB, so many images in one request would fail. A client-side queue sends one image per request, 3 at a time. This also gives per-file progress and lets one bad file fail without stopping the rest.
- **Reuse `/api/analyze`.** Batch is the same endpoint with an extra `batchId`. No second classification path to maintain.
- **Server-side gating.** The page can show an upsell, but the server enforces Pro. A free user sending a `batchId` gets 403.
- **Limits are constants** in `lib/plans.ts`: `BATCH_MAX_FILES = 25`, `BATCH_CONCURRENCY = 3`.

## Files to create

- `lib/batch/queue.ts` – the queue runner as a pure module (no React, no fetch inside; the analyze function is injected so it can be tested).
- `lib/batch/csv.ts` – CSV builder with escaping.
- `components/home-workspace.tsx` (the mode switch on the main page), `components/batch/batch-uploader.tsx`, `components/batch/batch-table.tsx`.

## API changes

`POST /api/analyze` accepts an optional form field `batchId` (uuid).
- If `batchId` is present: call `requirePlan("pro")`. Non-Pro users get 403 `pro_required`. Invalid uuid gets 400.
- The scan is saved to history with that `batch_id` (Spec 03 logic).
- Rate limit for authenticated users is per user id (for example 60 requests per minute), high enough for a normal batch. Return `rate_limited` with `Retry-After` if exceeded, and the queue must handle it (see below).

## Queue behavior (`queue.ts`)

State per item: `queued` → `compressing` → `analyzing` → `done` | `failed`, plus `canceled`.

- Runs up to `BATCH_CONCURRENCY` items at the same time. Starts the next item when one finishes.
- Each item: validate the file (type and size) → compress (Spec 01 util) → send → store the result or an error code and message.
- On `rate_limited`: wait for `Retry-After` and retry that item automatically up to 2 times. Other errors are not retried automatically.
- **Retry:** one item or "Retry failed" for all failed items. A retry is a new request for that file only.
- **Cancel remaining**: stops starting new items, lets in-flight ones finish.
- Files over the max count are rejected up front with a clear message (no silent truncation). Duplicate files (same name, size, and last-modified) are skipped with a note.
- `beforeunload` warning while the queue is running.
- The runner exposes a subscribe or callback for state changes so the UI re-renders per item.

## UI

**Main page `/`: a "Single image / Batch" switch above the uploader** (owner decision: batch is a mode of the main page, not a separate page or nav item).
- Non-Pro: the Batch option is disabled and shows a "Pro" badge, with a visible line under the switch: "Batch upload is part of the Pro plan. View plans" (link to `/pricing`). The uploader is not usable.
- Switching modes must not lose a running batch: the batch panel stays mounted while hidden.
- Pro:
  1. Multi-file drop zone with helper text "Up to 25 images. JPEG, PNG or WebP, up to 10 MB each".
  2. After selection: a table with thumbnail, file name, size, status badge, verdict badge, confidence, reason, and a per-row Retry button for failed rows. The "Analyze all" button starts the queue.
  3. Summary bar above the table: total, done, failed, hot dogs, not hot dogs, and an overall progress bar.
  4. Filter by verdict and status. Sort by confidence.
  5. **Export CSV** button (enabled when at least one item is done): downloads the results client-side.
  6. Empty, loading, error states per AGENTS.md. Announce progress changes with `aria-live="polite"`.
- There is no "Batch" link in the top bar and no `/batch` route.
- After a batch, link to History. Show a small batch badge on history items.

## CSV export (`csv.ts`)

- Columns: `file_name, verdict, confidence, reason, status, analyzed_at`.
- Include only finished items, plus failed items with `status = failed` and the error code in `reason`.
- Escape quotes, commas, and newlines per RFC 4180.
- **Spreadsheet formula injection protection**: if a cell starts with `=`, `+`, `-`, or `@`, prefix it with a single quote. File names come from users, so this matters.
- Add a UTF-8 BOM so Excel opens non-English names correctly.
- File name: `hot-dog-or-not-results-YYYY-MM-DD.csv`.

## Security checklist

- Pro is enforced in the API, not only in the UI.
- `batchId` is only a grouping label. It never grants access to anything. Scans are always owned by the signed-in user.
- Sanitize file names (already done for history) and escape them in CSV.
- Concurrency and total file count are capped on the client, and the per-user rate limit protects the server.

## Tests

- `queue.ts` with a fake analyze function: respects concurrency (never more than 3 in flight), completes all items, one failure does not stop others, retry reruns only the failed item, cancel stops new items, `rate_limited` triggers the delayed retry.
- `csv.ts`: quotes, commas, newlines, formula prefix escaping, and column order.
- `/api/analyze`: free user with `batchId` gets 403 `pro_required`; Pro user with `batchId` saves a scan with `batch_id`; invalid `batchId` gets 400.

## Acceptance criteria

- [ ] A free account sees the Batch option disabled with the Pro note on the main page, and a direct request with `batchId` is rejected with 403.
- [ ] Switching between Single image and Batch while a batch is running does not interrupt it.
- [ ] A Pro user uploads 10 phone photos: at most 3 are analyzed at the same time, each row updates on its own, and all finish.
- [ ] One bad file (for example a renamed PDF) fails alone with a clear message. Retrying the failed rows works without re-running the finished ones.
- [ ] The summary counts match the table. CSV opens in Excel or Sheets with the right columns, and a file named `=SUM(1+1).jpg` is escaped.
- [ ] Batch scans appear in History.
- [ ] Lint, tests, build green in CI. Deployed. Committed with a clear message.

## README notes to capture

Why one request per image (platform body limit, isolated failures), the reused endpoint, server-side Pro gating, CSV injection protection, and what a production version would add (a background job queue for large batches, per-team workspaces, webhooks, an API key for programmatic use).

## Implementation notes and spec updates

Changes made while implementing this spec. The spec was built as written, including CSV export (confirmed by the product owner).

**Deviations from the spec text**

- **Too many files:** a selection that would take the batch over 25 images is rejected as a whole, with a message, and nothing from it is added. This avoids silently adding only some of the files.
- **Pro check order in `/api/analyze`:** the plan check runs after the file checks and before any quota is used. A visitor sending a `batchId` gets 401 `unauthorized`, a free account gets 403 `pro_required`, and only then is the `batchId` validated (400 `invalid_request` if it is not a uuid). The plan check is the shared `planGate` function that `requirePlan` also uses.
- **One batch id per page session.** It is created when the page opens, shared by every file added in that session, and replaced by "Start over".
- **Cancel:** "Cancel remaining" turns the queued items into `canceled` and lets running ones finish. A canceled item can be retried with its row button. "Retry failed" retries failed items only.
- **Rate limit** for signed-in users stays at 60 requests per minute per account (see the notes in Spec 03). When the server answers 429 the queue waits for `Retry-After` (5 seconds if the header is missing) and retries that item up to 2 times.
- **CSV:** besides `=`, `+`, `-` and `@`, a cell starting with a tab or carriage return is also defused with a leading quote. `confidence` is written as a plain number and `analyzed_at` as an ISO timestamp. Items that never finished (queued, running, canceled) are not exported.
- **Batch is a mode of the main page** (owner decision, after the first version had its own `/batch` page and nav link). `components/home-workspace.tsx` shows a "Single image / Batch" switch. For non-Pro users the Batch option is disabled with a "Pro" badge and a visible "View plans" line. The `/batch` route and the nav link were removed. The single-image mode unmounts when hidden, the batch mode stays mounted so a running batch survives switching. The switch decides only what the page offers: the server still rejects a `batchId` from a non-Pro user.
- **History:** history items now carry `batchId`, and show a "Batch" badge when they belong to a batch.
- **Thumbnails** in the table are local previews of the files the user picked, and are released when the user starts over or leaves the page.
- **Extra files:** `lib/analyze/client.ts` (the request helper, now shared with the single-image analyzer, which was changed to use it), `lib/batch/view.ts` (filter and sort), `lib/batch/adapters.ts` (compression and the analyze call for the queue) and `components/batch/batch-drop-zone.tsx`.
- **No database change.** The `batch_id` column already exists from Spec 03, so there is no new migration.

**Not verified yet**

- The page has not been opened in a browser and no real batch has been run. The concurrency limit of 3, retries, cancel and rate-limit handling are covered by unit tests with fake analyze functions only.
- None of the acceptance criteria is ticked. In particular, try 10 real phone photos, a renamed PDF, a file named `=SUM(1+1).jpg`, and open the CSV in Excel or Sheets.
