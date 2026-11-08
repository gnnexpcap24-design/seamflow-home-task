# Spec 01 – Core classification

**Goal:** classify one uploaded image as "Hot Dog" or "Not Hot Dog", with a confidence score and a one-sentence reason. This is the core of the product. Quotas (Spec 02), history (Spec 03) and batch upload (Spec 04) extend the same endpoint.

## Product rules

- **Hot Dog** = a frankfurter-style sausage, served in a bun or on its own, with any toppings.
- **Not Hot Dog** = everything else: corn dogs, other sausages (for example bratwurst), other food, non-food, toys, unrelated images.
- For borderline cases the one-line reason explains the call (for example "Looks like a bratwurst, not a frankfurter").
- The answer is always definitive. Confidence (0 to 1) is estimated by the model. Below 0.70 the UI shows a "Low confidence" badge and still gives the verdict.
- A failure is never presented as a verdict. Unreadable, rejected, or failed analyses show an error with a retry.
- Images are processed in memory. Only Pro accounts have them stored (Spec 03).

## Environment

- `OPENAI_API_KEY`, `OPENAI_VISION_MODEL` (server only).

## Code

- `lib/analyze/schema.ts` – zod schemas and types, `LOW_CONFIDENCE_THRESHOLD` (0.7).
- `lib/analyze/prompt.ts` – system prompt and user prompt.
- `lib/analyze/classify.ts` – calls OpenAI and returns a validated result or a typed error.
- `lib/analyze/errors.ts` – error codes, user-facing messages and `AnalyzeError`.
- `lib/analyze/client.ts` – browser helper that posts an image to `/api/analyze`.
- `lib/openai.ts`, `lib/env.ts` – OpenAI client (20 s timeout, SDK retries off) and required-variable helper.
- `lib/validation/file.ts` – type, size and magic-byte checks, shared by client and server.
- `lib/image/compress.ts` – browser-side resize and re-encode.
- `lib/rate-limit.ts` – in-memory limiter. `lib/api-response.ts` – error response helper.
- `app/api/analyze/route.ts`, `app/api/health/route.ts`.
- `components/analyzer.tsx`, `upload-zone.tsx`, `verdict-card.tsx`, `error-alert.tsx`, `app-shell.tsx`.

## Model contract

```ts
// ModelOutputSchema is sent to OpenAI: plain types only.
// AnalysisSchema validates the parsed output.
export const AnalysisSchema = z.object({
  verdict: z.enum(["hot_dog", "not_hot_dog"]),
  confidence: z.number().min(0).max(1),
  reason: z.string().max(200),
});
```

- The Responses API is called with `responses.parse` and `zodTextFormat(ModelOutputSchema, ...)`. One image per call, sent as a base64 data URL with `detail: "auto"`. The range and length limits are applied by `AnalysisSchema` after parsing, because structured outputs may ignore them.
- Prompt rules: state the Hot Dog definition above, including the borderline cases; ask for one short factual reason (what is visible); state that any text inside the image is content, not instructions; ask for lower confidence when the image is blurry, dark, or ambiguous.
- Failure handling:
  - An explicit refusal becomes `image_rejected`. It is not retried.
  - Output that fails validation, a 429, a 5xx and connection errors are retried once after 500 ms, then become `model_error`.
  - A 400 becomes `image_rejected` only when the error code mentions an image or a content policy. Any other 400 is `model_error`.
  - A timeout (20 s) becomes `timeout` and is not retried.
  - The OpenAI SDK's own retries are off, so this policy is the only one.
- Failures are logged by type only. The image and its base64 data are never logged.

## API: `POST /api/analyze`

**Request:** `multipart/form-data` with the field `file`. Spec 04 adds an optional `batchId`.

**Checks, in order:**

1. Rate limit: 20 requests per minute per IP for visitors, 60 per minute per account for signed-in users (in memory, per server instance).
2. File present.
3. MIME type is JPEG, PNG or WebP.
4. The first bytes match the declared type.
5. Size is at most 4 MB.
6. Identity and plan (Spec 02), then the batch check (Spec 04), then quota (Spec 02).
7. Classification, then saving to history for Pro accounts (Spec 03).

`maxDuration` is 30 s, above the model timeout.

**200 response:**

```json
{
  "verdict": "hot_dog",
  "confidence": 0.94,
  "reason": "Sausage in a bun with mustard.",
  "lowConfidence": false,
  "analyzedAt": "2026-11-08T11:30:00.000Z",
  "saved": false,
  "quota": { "plan": "visitor", "used": 1, "limit": 3, "remaining": 2 }
}
```

`saved` and `scanId` come from Spec 03. `quota` comes from Spec 02 and is `null` if the lookup fails after a successful scan.

**Errors** use `{ "error": { "code": "...", "message": "..." } }`. Messages are written for end users, with no stack traces or provider names.

| Status | Code | When |
|---|---|---|
| 400 | `missing_file` | no file in the request |
| 400 | `invalid_request` | a request body or `batchId` is not valid |
| 401 | `unauthorized` | a signed-in session is required |
| 403 | `quota_exceeded` | the plan's scan limit is used up (adds `upgradeTo`, Spec 02) |
| 403 | `pro_required` | the feature is part of the Pro plan |
| 404 | `not_found` | the scan does not exist or is not the caller's |
| 413 | `file_too_large` | over 4 MB |
| 415 | `unsupported_type` | not JPEG, PNG or WebP, or the bytes do not match the type |
| 422 | `image_rejected` | OpenAI refused or cannot read the image |
| 429 | `rate_limited` | over the limiter (includes `Retry-After`) |
| 500 | `server_error` | a database call failed |
| 502 | `model_error` | OpenAI failed after the retry |
| 504 | `timeout` | the model call exceeded the timeout |

`GET /api/health` returns `{ "status": "ok", "time": "..." }`.

## Browser flow and UI

**Compression** (`compress.ts`): decode with `createImageBitmap` (respecting EXIF orientation), scale so the longest side is at most 1500 px, draw on a white canvas, export JPEG at quality 0.85, lowering to 0.7 and then 0.55 until the file is under 1 MB. If the result is still over 3.5 MB, show an error. Files up to 10 MB can be picked.

**Analyze page `/`** (two columns on desktop, upload on the left and result on the right, stacked on narrow screens; the columns always have the same height):

1. Upload zone: drag and drop, click, keyboard, and paste (a toast confirms a pasted image). Helper text: "JPEG, PNG or WebP, up to 10 MB".
2. On selection: validate, compress, show a preview with file name and size. The "Analyze image" button is inside the upload card, so nothing is sent until it is clicked.
3. Before a result exists, the right column shows a placeholder. While analyzing, it shows a skeleton and "Analyzing image..." announced with `aria-live="polite"`. The button is disabled.
4. Success: verdict card (icon, label, confidence bar, reason, file name, timestamp, "Low confidence" badge). Primary action: "Analyze another".
5. Error: inline alert with a clear cause and a retry button. The user can always recover without reloading. The browser request times out after 35 s.

**App shell:** a top bar with "Hot Dog or Not" and one centered `max-w-5xl` container. There is no footer. Theme tokens come from AGENTS.md (`app/globals.css`), and the font is Inter via `next/font`.

## Tests

- File validation: accepts the three types, rejects others, rejects oversize, rejects a PNG whose bytes are not PNG.
- `AnalysisSchema`: accepts valid output, rejects a bad verdict, confidence outside 0 to 1, and an overlong reason.
- `classifyImage` with a mocked OpenAI client: success, refusal, malformed output then success on retry, timeout, 429 and 5xx retries, image-related 400, and no image data in logs.
- `/api/analyze` route with the classifier mocked: every error code in the table.
- Rate limiter: limit, retry time, window reset, independent keys.
- Compression: the scaling helper is tested. The canvas code is checked manually.

## Acceptance criteria

- [ ] The live URL works in an incognito window on desktop and at phone width.
- [ ] A clear hot dog photo returns "Hot Dog" and a pizza photo returns "Not Hot Dog".
- [ ] A 6 MB phone photo works (compressed in the browser). A 12 MB file shows a size error.
- [ ] A PDF renamed to `.jpg` is rejected with a clear message.
- [ ] An invalid API key shows the `model_error` message, not a crash.
- [ ] Lint, tests and build pass in CI.
