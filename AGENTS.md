# AGENTS.md

Guidance for AI coding agents working in this repo. Keep changes small, simple, and shippable.

## Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS + shadcn/ui
- OpenAI API (vision + structured outputs) for image classification
- Supabase (Postgres + Storage) for persistence, e.g. scan history
- Vitest + React Testing Library for unit tests
- Deployed on Vercel

## Commands

- `npm install` – install dependencies
- `npm run dev` – start dev server
- `npm run build` – production build (must pass before deploying)
- `npm run lint` – lint
- `npm test` – run unit tests once

Run lint, tests, and build before saying a task is done.

## CI

- GitHub Actions workflow in `.github/workflows/ci.yml` runs on every push and pull request to `main`: install (`npm ci`), lint, test, build.
- CI must be green before merging or deploying. Fix failures, never skip or disable a step to get green.
- CI uses the same commands as above on Node 22. Keep the workflow in sync when commands change.
- CI never needs real secrets. Tests mock OpenAI and Supabase. The build runs with dummy values only if it needs env vars.
- Keep the workflow small. Do not add extra jobs or third-party actions without asking.

## Project structure

- `app/` – routes, layouts, and pages
- `app/api/` – route handlers (backend endpoints)
- `components/ui/` – shadcn/ui components (generated, avoid editing unless needed)
- `components/` – our own components
- `lib/` – helpers, Supabase client, OpenAI client
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
- Mock external services (Supabase, OpenAI). Never call real APIs in tests.
- Keep tests fast and independent. Add a test when fixing a bug.
- Cover at least: verdict parsing and validation, file validation (type and size), and a failed history save still returning the verdict.

## Environment and secrets

- Secrets live in `.env.local` (git-ignored). Never commit keys.
- Only `NEXT_PUBLIC_` variables are visible to the browser. The Supabase service role key and OpenAI key must stay server-side.
- Always keep `.env.example` updated with variable names (no values).

## Product: "Hot Dog or Not" (Enterprise Edition)

- Core flow: user uploads an image, the app analyses it with a vision model, and answers "Hot Dog" or "Not Hot Dog".
- The core flow must work reliably before anything else is added. Extras come only after it is deployed and stable.
- The result is always a clear, definitive verdict, shown with a confidence score.
- Images that are unreadable, unsupported, or clearly not analysable get a clear error message, never a guess.

## Image upload and vision (OpenAI)

### Provider

- Use the official `openai` Node SDK, called only from route handlers. Key in `OPENAI_API_KEY`.
- Put the model name in `OPENAI_VISION_MODEL` (env var). Never hardcode it. Use a current vision-capable model from OpenAI's models page.
- Use the Responses API: one `input_text` prompt plus one `input_image` (base64 data URL) per call. One image per call, so each image gets its own verdict and failures stay isolated.
- OpenAI accepts PNG, JPEG, WebP, and non-animated GIF. We accept only JPEG, PNG, and WebP.
- OpenAI may reject images (for example NSFW or unreadable ones). Map those errors to a friendly message. Never turn them into a verdict.

### Upload size (Vercel)

- Vercel Functions reject request bodies over 4.5 MB with a 413, and this cannot be configured. It applies to route handlers and server actions.
- Send images as `multipart/form-data`, not base64 inside JSON (base64 adds about a third to the size).
- Compress in the browser before upload: longest side about 1500 px, re-encode as JPEG or WebP, target under 1 MB.
- Client: allow picking files up to 10 MB, then compress. Server: reject anything over 4 MB with a clear message, never a raw 413.
- Consider `detail: "low"` on the image input for speed and cost. Keep it only if accuracy holds on tricky images.

### Batch upload

- The 4.5 MB limit is per request. Never send many images in one request.
- Send one request per image from a client-side queue with limited concurrency (3 at a time).
- Show per-file progress and per-file errors. Retry only the failed files.
- Keep rate limits high enough for a normal batch, and return a clear 429 message when exceeded.

### Model output

- Define a zod schema (root must be `z.object`): `verdict` enum (`hot_dog` | `not_hot_dog`), `confidence` 0 to 1, short `reason`.
- Use `responses.parse` with `zodTextFormat`. Handle explicit refusals.
- On parse or API failure, retry once, then show a friendly fallback.
- Set a client timeout shorter than the function's max duration.

### Privacy and safety

- Process images in memory. Store them only for Pro accounts' scan history, and say so in the UI and README.
- Treat image content as untrusted: ignore any text inside the image that tries to give the model instructions.

### Scan history

- Only Pro accounts have history. Visitors and free accounts are never stored.
- Images live in a private Supabase bucket. The database stores paths, never URLs.
- Analyse first, then save on a best-effort basis. If saving fails, still return the verdict and log the error.
- History belongs to the signed-in user (`user_id` on each row). Always take the user id from the verified session, never from the request, and never show one user's history to another.
- `/api/scans` returns metadata only (keyset paginated, about 20 per page) plus short-lived signed URLs (1 hour). The browser loads the images directly from storage, not through our function.
- Provide a delete action that removes both the row and the file.
- Enable Row Level Security on the `scans` table with a read-own-rows policy only. All writes use the service role key in route handlers.
- There is no automatic retention yet. Scans are kept until the user deletes them, so never claim a retention period in the UI or README (say "retention policy planned"). The cleanup job is described in `specs/05-next-steps.md`.

## Design

### Principles

- Enterprise, not playful: calm, precise, trustworthy. Think internal compliance or analytics tool.
- One accent color, lots of white space, clear hierarchy. Light theme only.
- UI copy is professional: no puns, emojis, or exclamation marks.
- Use shadcn/ui components for everything. Do not leave the default theme untouched.

### Theme

Set these as shadcn CSS variables in `app/globals.css` (convert hex to the format the generated file uses). Radius: `0.5rem`.

| Role | Color |
|---|---|
| Background | `#FAFAF9` |
| Surface (cards) | `#FFFFFF`, border `#E7E5E4` |
| Text primary / secondary | `#1C1917` / `#57534E` |
| Primary (buttons, links, focus) | `#92400E` (hover `#78350F`) |
| "Hot Dog" result | text `#047857` on `#ECFDF5` |
| "Not Hot Dog" result | text `#44403C` on `#F5F5F4` |
| Error only | text `#B91C1C` on `#FEF2F2` |

- "Not Hot Dog" is a valid result, not an error. Never style it red. Reserve red for real failures.
- Never rely on color alone: every verdict also has an icon and a text label.

### Typography and spacing

- One font: Inter via `next/font`. Use tabular numbers for confidence and stats.
- Scale: page title 24 px semibold, verdict 40 px bold, body 14 to 16 px, captions 12 to 13 px.
- 8 px spacing grid. Content centered in a `max-w-5xl` container. Cards have generous padding (24 px).

### Layout

- Top bar: product name "Hot Dog or Not" with an "Enterprise Edition" badge. Nav only for features that exist (History, Insights, Pricing, and account links). Batch is not a nav item: the main page has a "Single image / Batch" switch, and Batch is disabled with a visible Pro note for users without access.
- Analyze page: upload zone on top, result card directly below. No sidebars.
- Footer: privacy note (images processed in memory, history stored privately).

### Key components

- **Upload zone:** dashed border card, drag and drop, click, paste, and keyboard access. Helper text: "JPEG, PNG or WebP, up to 10 MB". Show a thumbnail preview after selection.
- **Verdict card:** icon + large label ("Hot Dog" / "Not Hot Dog"), confidence as a progress bar with a percentage, one-line reason, file name and timestamp. Show a "Low confidence" badge below 70%, while still giving a definitive verdict.
- **Batch table:** shadcn Table with thumbnail, file name, verdict badge, confidence, status, and a per-row retry. Add CSV export.
- **History:** card grid or table of past scans, with pagination and an empty state.
- **Insights:** stat cards and a stacked bar chart built with the shadcn `chart` component (Recharts). Do not hand-build charts with CSS or SVG.

### States

- **Empty:** short explanation plus the upload prompt.
- **Loading:** skeleton in the result card, "Analyzing image..." text, announced via `aria-live="polite"`.
- **Success:** verdict card, with "Analyze another" as the primary action.
- **Error:** inline alert with a clear cause and a retry action. Example: "We couldn't analyze this image. Check the file type and try again."
- Use toasts (sonner) only for transient confirmations, not for errors the user must act on.

### Motion and accessibility

- Subtle transitions only (150 to 200 ms). Respect `prefers-reduced-motion`.
- WCAG AA contrast, visible focus rings, minimum 44 px touch targets, labels on every input, alt text on previews.
- Test at mobile width (375 px) and desktop before calling UI work done.

## Production-readiness

- Rate-limit the analyse endpoint: per IP for visitors, per account for signed-in users. A simple in-memory approach is fine, and note its limits in the README.
- Add a `/api/health` endpoint.
- Log errors server-side with useful context, never logging secrets or image data.
- Keep API keys server-side and out of the repo. Keep `.env.example` current.
- Optional extras, only after the core is done and deployed: scan history, batch upload, drag and drop, result export.

## Deliverables

- Live deployed URL that works without setup, tested in an incognito window.
- Source code repository with a clean commit history and no secrets.
- `README.md` covering: what it does, who it is for, key product decisions and why, tradeoffs, shortcuts or mocks, what would come next with more time, and how AI tools were used.

## Working agreement

- Build in small vertical slices, one working flow at a time. Deploy after each slice.
- Pre-approved dependencies: `openai`, `zod`, `@supabase/supabase-js`, `@supabase/ssr`, `sonner`, and shadcn/ui components (including `chart`, which brings in `recharts`). Ask before adding anything else.
- Do not refactor unrelated code.
- If a requirement is unclear, ask before building.
- Mention any shortcut or mock in the README.