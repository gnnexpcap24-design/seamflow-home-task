# Hot Dog or Not (Enterprise Edition)

Upload an image and get a definitive verdict, "Hot Dog" or "Not Hot Dog", with a confidence score. Vision model: OpenAI. Stack: Next.js, TypeScript, Tailwind, shadcn/ui, Supabase (later specs), Vercel.

Specs live in `specs/`. This README covers Spec 01 (core classification).

## Run locally

1. Use Node 22 (`nvm use`).
2. `cp .env.example .env.local` and fill in `OPENAI_API_KEY` and `OPENAI_VISION_MODEL` (for example `gpt-5.4-nano`). The Supabase variables are not used by Spec 01.
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

## Endpoints

- `POST /api/analyze` – field `file`. Returns the verdict or `{ "error": { "code", "message" } }`.
- `GET /api/health` – `{ "status": "ok", "time": "..." }`.

## Database migrations (for later specs)

Migrations are in `supabase/migrations/` and are applied with the Supabase CLI against the linked project:

```
npx supabase db push --remote --dry-run
npx supabase db push --remote
```

## Deploy (Vercel)

Import the repo and add `OPENAI_API_KEY` and `OPENAI_VISION_MODEL` under Settings, Environment Variables (all environments). Redeploy after changing variables.

## Shortcuts and known gaps

- Tailwind is pinned to 4.1.18 (newer versions need a newer Node locally).
- The in-memory rate limiter is per instance (see above).
- The UI has no component tests. Compression logic that needs a real canvas is covered by manual testing.
- Spec decisions and deviations are recorded at the end of `specs/01-core-classification.md`.
