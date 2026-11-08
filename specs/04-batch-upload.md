# Spec 04 – Batch upload (Pro)

**Goal:** Pro users can analyze many images in one go, see progress per file, retry failures, and export the results as CSV.
**Depends on:** Specs 01 to 03 (plans, plan gating, saving to history).

## Decisions

- **One request per image.** The platform limits each request body to 4.5 MB, so many images in one request would fail. A queue in the browser sends one image per request, 3 at a time. This also gives per-file progress and lets one bad file fail without stopping the rest.
- **Reuse `/api/analyze`.** Batch is the same endpoint with an extra `batchId`. There is no second classification path.
- **Server-side gating.** The page decides what to offer, but the server enforces Pro. A free account sending a `batchId` gets 403.
- **Batch is a mode of the main page**, not a separate page or navigation item.
- **Limits are constants** in `lib/plans.ts`: `BATCH_MAX_FILES = 25`, `BATCH_CONCURRENCY = 3`.

## Code

- `lib/batch/queue.ts` – the queue as a pure module with no React and no fetch. The prepare and analyze functions are injected, so it is tested with fakes.
- `lib/batch/adapters.ts` – the real prepare step (validate and compress) and analyze step (request with the batch id) used by the queue.
- `lib/batch/view.ts` – filtering, sorting and pagination of the items (`BATCH_PAGE_SIZE = 5`).
- `lib/batch/csv.ts` – CSV builder with escaping.
- `lib/analyze/client.ts` – the request helper shared with the single-image analyzer.
- `components/home-workspace.tsx` (the mode switch on the main page), `components/batch/batch-uploader.tsx`, `batch-drop-zone.tsx`, `batch-table.tsx`, and `components/pagination-controls.tsx`.

## API changes

`POST /api/analyze` accepts an optional form field `batchId` (uuid).

- If `batchId` is present, the caller must be Pro: a visitor gets 401 `unauthorized` and a free account gets 403 `pro_required`. This is checked before any quota is used. A `batchId` that is not a uuid gets 400 `invalid_request`.
- The scan is saved to history with that `batch_id` (Spec 03).
- Signed-in users are limited to 60 requests per minute per account, enough for a normal batch. Over the limit, the endpoint returns 429 `rate_limited` with `Retry-After`, and the queue handles it.

## Queue behavior (`queue.ts`)

State per item: `queued`, `compressing`, `analyzing`, then `done` or `failed`, plus `canceled`.

- Up to `BATCH_CONCURRENCY` items run at the same time. The next one starts when one finishes.
- Each item is validated (type and size), compressed (the Spec 01 compression), sent, and then stores its result or an error code and message. The compressed file is kept, so retrying a failed analysis does not compress again.
- On `rate_limited`, the queue waits for `Retry-After` (5 seconds if the header is missing) and retries that item automatically, up to 2 times. Other errors are not retried automatically.
- **Retry:** a failed or canceled item can be retried with its row button, and "Retry failed" retries all failed items. A retry is a new request for that file only.
- **Cancel remaining:** queued items become `canceled`, and items already running finish.
- A selection that would take the batch over 25 images is rejected as a whole with a message, and nothing from it is added. Duplicate files (same name, size and last-modified time) are skipped, and the message lists them.
- A browser "leave this page?" warning is shown while the queue is running.
- The queue notifies subscribers on every change, so the UI re-renders per item.
- One batch id is created when the page opens, shared by every file of the session, and replaced by "Start over".

## UI

**Main page `/`: a "Single image / Batch" switch under the page title.**

- Without Pro, the Batch option is disabled and shows a "Pro" badge, with a visible line under the switch: "Batch upload is part of the Pro plan. View plans" (a link to `/pricing`).
- Switching modes does not lose a running batch: the batch panel stays mounted while hidden. The single-image mode unmounts when hidden.
- With Pro, batch mode is two columns on desktop and stacked on narrow screens:
  - **Left column:** the drop zone ("Up to 25 images. JPEG, PNG or WebP, up to 10 MB each"), then, once files are added, a summary (total, done, failed, hot dogs, not hot dogs, and an overall progress bar), the actions, and the filters. Once files exist, the drop zone shrinks to a one-line "Add more images" strip.
  - **Actions:** Analyze all, Cancel remaining (while running), Retry failed, Export CSV (enabled when at least one item is done), Start over, and a "View in History" link when the batch has finished.
  - **Filters:** by verdict (All, Hot Dog, Not Hot Dog) and by status (All, Done, Failed, Pending), and a sort by confidence that cycles through none, high first and low first.
  - **Right column:** a compact table with three columns (file with thumbnail, name, size and reason or error; verdict with confidence; status with the retry button), five rows per page with Previous and Next. Changing a filter returns to page 1. Before any file is added, a placeholder fills the column. Both columns have the same height.
- Progress changes are announced with `aria-live="polite"`.
- Thumbnails are local previews of the picked files and are released when the user starts over or leaves the page.
- There is no "Batch" link in the top bar and no `/batch` route. Batch scans appear in History with a small "Batch" badge.

## CSV export (`csv.ts`)

- Columns: `file_name, verdict, confidence, reason, status, analyzed_at`.
- Only finished items are exported: `done` items with their result, and `failed` items with an empty verdict and confidence and the error code in `reason`. Items that never finished (queued, running, canceled) are left out.
- Fields are escaped per RFC 4180 (quotes doubled, fields with commas, quotes or line breaks quoted, CRLF line endings).
- **Formula injection protection:** a cell starting with `=`, `+`, `-`, `@`, a tab or a carriage return is prefixed with a single quote. File names come from users, so this matters.
- A UTF-8 BOM is added so Excel opens non-English names correctly. File names are sanitized as in History.
- The file is named `hot-dog-or-not-results-YYYY-MM-DD.csv` and is built in the browser.

## Security checklist

- Pro is enforced in the API, not only in the UI.
- `batchId` is only a grouping label. It never grants access to anything, and scans are always owned by the signed-in user.
- File names are sanitized and escaped in the CSV.
- Concurrency and total file count are capped in the browser, and the per-account rate limit protects the server.

## Tests

- Queue with fake functions: never more than 3 in flight, all items complete, one failure does not stop the others, retry reruns only the failed item without compressing again, cancel stops new items, a canceled item can be retried, a rate limit triggers the delayed retry (up to 2 times), other errors are not retried, duplicates are skipped, an over-limit selection is rejected whole, subscriptions and clearing.
- CSV: quoting, line breaks, formula prefixes, column order, BOM, which items are exported, and the file name.
- View helpers: filter by verdict and status, sort with unfinished items last, and pagination boundaries.
- Adapters and request helper: error mapping and `Retry-After`, validation before compression.
- `/api/analyze`: a visitor with `batchId` gets 401, a free account gets 403 `pro_required`, a Pro user saves the scan with its batch id, and an invalid `batchId` gets 400.

## Acceptance criteria

- [ ] A free account sees the Batch option disabled with the Pro note on the main page, and a direct request with `batchId` is rejected with 403.
- [ ] Switching between Single image and Batch while a batch is running does not interrupt it.
- [ ] A Pro user uploads 10 phone photos: at most 3 are analyzed at the same time, each row updates on its own, and all finish.
- [ ] One bad file (for example a renamed PDF) fails alone with a clear message. Retrying the failed rows works without re-running the finished ones.
- [ ] The summary counts match the table. The CSV opens in Excel or Sheets with the right columns, and a file named `=SUM(1+1).jpg` is escaped.
- [ ] Batch scans appear in History.
- [ ] Lint, tests and build pass in CI.
