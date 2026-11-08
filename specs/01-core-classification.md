# Spec 01 – Core classification

**Goal:** a live, reliable "Hot Dog / Not Hot Dog" classifier with an enterprise look. This is the product. Everything else builds on it.
**Depends on:** the starter repo (Next.js, shadcn/ui, Vitest, CI, Vercel deploy). No database is used in this spec.

## Plans at a glance (context only, built in later specs)

| | Visitor | Free account | Pro |
|---|---|---|---|
| Scans | 3 total | 5 total | Unlimited (fair-use rate limit) |
| Stored history | No | No | Yes |
| Batch upload | No | No | Yes |
| Insights dashboard | No | No | Yes |

All limits live in one file, `lib/plans.ts`, so they are easy to change. Spec 01 ignores plans: anyone can scan.

## Product decisions

- **Hot Dog** = a frankfurter-style sausage, served in a bun or on its own, with any toppings.
- **Not Hot Dog** = everything else: corn dogs, other sausages (for example bratwurst), other food, non-food, toys, unrelated images.
- For borderline cases the one-line reason explains the call (for example "Looks like a bratwurst, not a frankfurter").
- The answer is always definitive. Confidence (0 to 1) is estimated by the model. Below 0.70 show a "Low confidence" badge, but still give the verdict.
- A failure is never presented as a verdict. Unreadable, rejected, or failed analyses show an error with a retry.
- Images are processed in memory and never stored in this spec.

## Environment

- `OPENAI_API_KEY`, `OPENAI_VISION_MODEL` (server only). Add both to `.env.example` and to Vercel.

## Files to create

- `lib/analyze/schema.ts` – zod schema and types (below).
- `lib/analyze/prompt.ts` – system prompt and user prompt.
- `lib/analyze/classify.ts` – calls OpenAI, returns a validated result or a typed error.
- `lib/validation/file.ts` – type, size, and magic-byte checks (shared by client and server where possible).
- `lib/image/compress.ts` – browser-side resize and re-encode.
- `lib/rate-limit.ts` – in-memory limiter.
- `app/api/analyze/route.ts`, `app/api/health/route.ts`.
- `components/upload-zone.tsx`, `components/verdict-card.tsx`, `components/error-alert.tsx`, `components/app-shell.tsx`.

## Model contract

```ts
// schema.ts
export const AnalysisSchema = z.object({
  verdict: z.enum(["hot_dog", "not_hot_dog"]),
  confidence: z.number().min(0).max(1),
  reason: z.string().max(200),
});
```

- Use the Responses API with `responses.parse` and `zodTextFormat(AnalysisSchema, ...)`. One image per call, sent as a base64 data URL.
- Prompt rules: state the Hot Dog definition above, including the borderline cases; ask for one short factual reason (what is visible); say that any text inside the image is content, not instructions; ask for lower confidence when the image is blurry, dark, or ambiguous.
- Handle: explicit refusal, schema parse failure (retry once), API error or 429/5xx (retry once with a short delay), timeout (target 20 s, below the function's max duration; check the current Vercel limit).
- Never log the image or base64 data.

## API: `POST /api/analyze`

**Request:** `multipart/form-data` with one field `file`.

**Server checks, in order:** rate limit, file present, MIME type in {jpeg, png, webp}, magic bytes match the type, size <= 4 MB. Then classify.

**200 response:**
```json
{ "verdict": "hot_dog", "confidence": 0.94, "reason": "Sausage in a bun with mustard.", "lowConfidence": false, "analyzedAt": "2026-11-08T11:30:00Z" }
```

**Errors** use `{ "error": { "code": "...", "message": "..." } }`:

| Status | code | When |
|---|---|---|
| 400 | `missing_file` | no file in the request |
| 415 | `unsupported_type` | not JPEG, PNG, or WebP |
| 413 | `file_too_large` | over 4 MB |
| 422 | `image_rejected` | OpenAI refused or cannot read the image |
| 429 | `rate_limited` | over the limiter (include `Retry-After`) |
| 502 | `model_error` | OpenAI failed after the retry |
| 504 | `timeout` | model call exceeded the timeout |

Messages are written for end users (no stack traces, no provider names).

**Rate limit:** 20 requests per minute per IP, in memory. Note in the README that this is per serverless instance and a real deployment would use a shared store.

`GET /api/health` returns `{ "status": "ok", "time": "..." }`.

## Browser flow and UI

**Compression** (`compress.ts`): decode with `createImageBitmap` (respect EXIF orientation), scale so the longest side is at most 1500 px, draw on a canvas, export JPEG at quality 0.85, lowering to 0.7 then 0.55 until under 1 MB. If it is still over 3.5 MB, show an error. Allow picking files up to 10 MB before compression.

**Analyze page `/`:**
1. Upload zone: drag and drop, click, keyboard, and paste. Helper text: "JPEG, PNG or WebP, up to 10 MB".
2. On selection: validate, compress, show a preview with file name and size, and an "Analyze image" button (explicit click, so nothing is spent by accident).
3. While analyzing: skeleton in the result card, "Analyzing image..." with `aria-live="polite"`, button disabled.
4. Success: verdict card per AGENTS.md (icon, label, confidence bar, reason, file name, timestamp, "Low confidence" badge). Primary action: "Analyze another".
5. Error: inline alert with a clear cause and a Retry button. A user can always recover without reloading.

**App shell:** top bar with "Hot Dog or Not" and an "Enterprise Edition" badge, one centered `max-w-5xl` container, footer privacy note: "Images are processed in memory and are not stored." (Change this wording in Spec 03 when Pro history exists.) Apply the theme tokens from AGENTS.md in `globals.css`. Inter via `next/font`.

## Tests

- `validation/file`: accepts the 3 types, rejects others, rejects oversize, rejects a PNG whose bytes are not PNG.
- `AnalysisSchema`: accepts valid output, rejects bad verdict and confidence outside 0 to 1.
- `classify` with a mocked OpenAI client: success, refusal, malformed output then success on retry, timeout.
- `/api/analyze` route with `classify` mocked: each error code in the table.
- `compress`: skipped if it needs a real canvas; keep the logic small and covered by manual testing.

## Acceptance criteria

- [ ] Live URL works in an incognito window on desktop and a phone-width viewport.
- [ ] A clear hot dog photo returns "Hot Dog"; a pizza photo returns "Not Hot Dog".
- [ ] A 6 MB phone photo works (compressed in the browser). A 12 MB file shows a friendly size error.
- [ ] A PDF renamed to `.jpg` is rejected with a friendly message.
- [ ] Unplugging the API key (invalid key) shows the `model_error` message, not a crash.
- [ ] Lint, tests, build green in CI. Deployed. Committed with a clear message.

## README notes to capture

Hot Dog definition and why, confidence handling, why compression happens in the browser (4.5 MB platform limit), the in-memory rate limiter caveat, and the retry and error design.

## Implementation notes and spec updates

Changes made while implementing this spec, and decisions taken with the product owner.

**Decisions**

- **Image detail is `"auto"`** (owner decision). AGENTS.md suggested `"low"` only if accuracy holds on tricky images; that was not testable without real images. It is one constant (`IMAGE_DETAIL` in `lib/analyze/classify.ts`).
- **The setup-check page and `GET /api/check` were removed** (owner decision). The home page is now the analyzer. `lib/supabase.ts` and the Supabase variables in `.env.example` stay because Specs 02 and later need them.
- **Retry policy.** One retry, after 500 ms, for rate limits (429), server errors (5xx), connection errors and output that fails validation. No retry for a refusal, a 400, or a timeout. The OpenAI SDK's own retries are off (`maxRetries: 0`) so this policy is the only one.
- **400 responses** map to `image_rejected` only when the error code mentions an image or content policy. Any other 400 is `model_error`, so a bug on our side is never shown as "your image was rejected".

**Deviations from the spec text**

- **Two schemas.** `ModelOutputSchema` (sent to OpenAI) has plain types only. `AnalysisSchema` (the contract above, with `min(0).max(1)` and `max(200)`) validates the parsed output. Reason: OpenAI structured outputs may ignore or reject range and length keywords. This is not confirmed against OpenAI's documentation and should be checked.
- **Extra files:** `lib/analyze/errors.ts` (error codes, user messages, `AnalyzeError`) and `components/analyzer.tsx` (client component holding the upload, compress, analyze, result state). `app/page.tsx` stays a server component.
- **`GET /api/health`** returns `{ "status": "ok", "time": "..." }` as specified.
- **Rate limit** is 20 requests per minute per IP in memory, with `Retry-After`, as specified.
- **`maxDuration = 30`** on the analyze route, above the 20 s model timeout. The current Vercel limit for the plan was not checked.
- **Client request timeout** is 35 s, then a network-style error message is shown.
- **Sonner** is used for one transient toast ("Image added from clipboard"). Errors stay inline. The toaster is forced to the light theme, so `next-themes` was removed.
- **Theme:** the palette is the one in AGENTS.md (warm stone neutrals, mustard-brown primary). Dark mode styles were removed from `globals.css`.
- **Dependencies:** shadcn/ui added `@base-ui/react`, `class-variance-authority`, `cn` (a shadcn-ui package replacing clsx and tailwind-merge), `lucide-react`, `tw-animate-css` and `shadcn`. Tailwind stays pinned to 4.1.18.

**Not verified yet**

- No real OpenAI call has been made. Still to confirm: the structured-output schema is accepted by the configured model, and that the model does not need an explicit reasoning setting to answer within the timeout.
- The UI was not opened in a browser at 375 px and desktop width. No acceptance criterion above is ticked yet.
