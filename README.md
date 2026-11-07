# Hot Dog or Not (skeleton)

Setup-check skeleton: verifies the OpenAI key and Supabase connection, locally and on Vercel. The core product is not built yet.

## Run locally

1. Use Node 22 (`nvm use`).
2. `cp .env.example .env.local` and fill in the values (`OPENAI_VISION_MODEL=gpt-5.4-nano` is the cheap default; `gpt-5.4-mini` if accuracy is not enough).
3. `npm install && npm run dev`, open http://localhost:3000 and click **Run checks**.

## Endpoints

- `GET /api/health` – liveness.
- `GET /api/check` – retrieves the configured OpenAI model (no tokens spent) and queries the Supabase `scans` table.

## Supabase

```sql
create table scans (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now()
);

alter table scans enable row level security;

create policy "anon can read scans" on scans for select to anon using (true);
```

The app uses the publishable key, so RLS decides what it can do. Add insert policies only when scan history is built.

## Vercel

Import the repo, add the four variables from `.env.example` under Settings → Environment Variables, deploy.

## Shortcuts

- shadcn/ui and Vitest are not set up yet.
- Tailwind is pinned to 4.1.18 (newer versions need Node >= 22.12 locally).
