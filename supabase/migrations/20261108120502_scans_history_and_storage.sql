-- Spec 03: Pro scan history, private image storage and insights.

create table public.scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  batch_id uuid,                       -- used by Spec 04
  file_name text not null,
  image_path text not null,            -- path in the bucket, never a URL
  verdict text not null check (verdict in ('hot_dog','not_hot_dog')),
  confidence numeric not null check (confidence >= 0 and confidence <= 1),
  reason text,
  flagged boolean not null default false,
  created_at timestamptz not null default now()
);

create index scans_user_created_idx on public.scans (user_id, created_at desc, id desc);

alter table public.scans enable row level security;

create policy "read own scans" on public.scans
  for select using (auth.uid() = user_id);
-- No insert, update or delete policy: writes happen only on the server with the service role key.

-- Private bucket. No storage policies are added, so only the server (service role) can read or write.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('scans', 'scans', false, 4194304, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Insights: one aggregate query per request, scoped to a single user.
-- Days are UTC dates. Missing days are filled in by the application.
create function public.scan_stats(p_user uuid, p_days int, p_low_confidence numeric)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'total', count(*),
    'hot_dogs', count(*) filter (where verdict = 'hot_dog'),
    'avg_confidence', avg(confidence),
    'low_confidence', count(*) filter (where confidence < p_low_confidence),
    'flagged', count(*) filter (where flagged),
    'per_day', coalesce((
      select jsonb_agg(jsonb_build_object(
        'day', d.day,
        'hot_dogs', d.hot_dogs,
        'not_hot_dogs', d.not_hot_dogs
      ) order by d.day)
      from (
        select (created_at at time zone 'utc')::date as day,
               count(*) filter (where verdict = 'hot_dog') as hot_dogs,
               count(*) filter (where verdict = 'not_hot_dog') as not_hot_dogs
        from public.scans
        where user_id = p_user
          and created_at >= (((now() at time zone 'utc')::date - (p_days - 1))::timestamp at time zone 'utc')
        group by 1
      ) d
    ), '[]'::jsonb)
  )
  from public.scans
  where user_id = p_user;
$$;

revoke execute on function public.scan_stats(uuid, int, numeric) from public, anon, authenticated;
grant execute on function public.scan_stats(uuid, int, numeric) to service_role;
