-- Scan counter per anonymous visitor (cookie id). Used by the quota logic (Spec 02).
create table public.visitor_usage (
  visitor_id uuid primary key,
  scans_used integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS on with no policies: only the server (service role) can read or write.
alter table public.visitor_usage enable row level security;
