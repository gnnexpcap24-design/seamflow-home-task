# AGENTS.md

Guidance for AI coding agents working in this repo. Keep changes small, simple, and shippable.

## Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS + shadcn/ui
- Vision-capable LLM API for image classification
- Supabase (Postgres) for persistence, e.g. scan history
- Vitest + React Testing Library for unit tests
- Deployed on Vercel

## Commands

- `npm install` – install dependencies
- `npm run dev` – start dev server
- `npm run build` – production build (must pass before deploying)
- `npm run lint` – lint
- `npm test` – run unit tests once

Run lint, tests, and build before saying a task is done.

## Project structure

- `app/` – routes, layouts, and pages
- `app/api/` – route handlers (backend endpoints)
- `components/ui/` – shadcn/ui components (generated, avoid editing unless needed)
- `components/` – our own components
- `lib/` – helpers, Supabase client, LLM client
- `tests/` or `*.test.ts(x)` next to the file – unit tests

## Conventions

- TypeScript everywhere. No `any` unless there is a good reason.
- Prefer server components. Use `"use client"` only when state or browser APIs are needed.
- Add UI with shadcn/ui components (`npx shadcn@latest add <component>`) before writing custom ones.
- Every screen needs loading, error, and empty states (use skeletons and toasts).
- Validate input on the server (zod) before using it.
- Keep functions short and names descriptive. No dead code or unused files.

## Testing

- Write unit tests for logic in `lib/` and for components with real behavior.
- Mock external services (Supabase, LLM). Never call real APIs in tests.
- Keep tests fast and independent. Add a test when fixing a bug.

## Environment and secrets

- Secrets live in `.env.local` (git-ignored). Never commit keys.
- Only `NEXT_PUBLIC_` variables are visible to the browser. The Supabase service role key and LLM key must stay server-side.
- Always keep `.env.example` updated with variable names (no values).

## LLM calls

- Call the LLM only from route handlers or server actions.
- Set a timeout, handle failures, and show a clear fallback message to the user.
- Prefer structured (JSON) output and validate it before use.
- Stream responses when it improves the experience.

## Product: "Hot Dog or Not" (Enterprise Edition)

- Core flow: user uploads an image, the app analyses it with a vision model, and answers "Hot Dog" or "Not Hot Dog".
- The core flow must work reliably before anything else is added. Extras come only after it is deployed and stable.
- The result is always a clear, definitive verdict, shown with a confidence score.
- Images that are unreadable, unsupported, or clearly not analysable get a clear error message, never a guess.

## Image upload and vision (OpenAI)
### Provider

- Use the official openai Node SDK, called only from route handlers. Key in OPENAI_API_KEY.
Put the model name in OPENAI_VISION_MODEL (env var). Never hardcode it. Use a current vision-capable model from OpenAI's models page.
Use the Responses API: one input_text prompt plus one input_image (base64 data URL) per call. One image per call, so each image gets its own verdict and failures stay isolated.
OpenAI accepts PNG, JPEG, WebP, and non-animated GIF. We accept only JPEG, PNG, and WebP.
OpenAI may reject images (for example NSFW or unreadable ones). Map those errors to a friendly message. Never turn them into a verdict.

### Upload size (Vercel)
- Vercel Functions reject request bodies over 4.5 MB with a 413, and this cannot be configured. It applies to route handlers and server actions.
- Send images as multipart/form-data, not base64 inside JSON (base64 adds about a third to the size).
- Compress in the browser before upload: longest side about 1500 px, re-encode as JPEG or WebP, target under 1 MB.
- Client: allow picking files up to 10 MB, then compress. Server: reject anything over 4 MB with a clear message, never a raw 413.
- Consider detail: "low" on the image input for speed and cost. Keep it only if accuracy holds on tricky images.

### Batch upload
- The 4.5 MB limit is per request. Never send many images in one request.
- Send one request per image from a client-side queue with limited concurrency (3 at a time).
- Show per-file progress and per-file errors. Retry only the failed files.
Keep rate limits high enough for a normal batch, and return a clear 429 message when exceeded.

## Design

- Enterprise look: neutral palette, one accent color, generous spacing, restrained typography, no playful clutter.
- Use shadcn/ui components throughout. Customise the theme so it does not look like the default.
- Clear states: empty (upload prompt), loading (skeleton or progress), success (verdict card), error (actionable message).
- Responsive on mobile and accessible (labels, focus states, keyboard upload, alt text, sufficient contrast).

## Production-readiness

- Rate-limit the analyse endpoint per IP. A simple approach is fine, and note its limits in the README.
- Add a `/api/health` endpoint.
- Log errors server-side with useful context, never logging secrets or image data.
- Keep API keys server-side and out of the repo. Keep `.env.example` current.
- Optional extras, only after the core is done and deployed: scan history, batch upload, drag and drop, result export.

## Working agreement

- Build in small vertical slices, one working flow at a time.
- Do not add new dependencies without asking.
- Do not refactor unrelated code.
- If a requirement is unclear, ask before building.
- Mention any shortcut or mock in the README.