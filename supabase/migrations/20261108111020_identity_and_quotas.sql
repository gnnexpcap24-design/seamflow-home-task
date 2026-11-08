-- Spec 02: accounts, plans and atomic scan quotas.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free','pro')),
  scans_used integer not null default 0,
  company text,
  billing_email text,
  pro_since timestamptz,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "read own profile" on public.profiles
  for select using (auth.uid() = id);
-- No insert or update policy: clients can never change their plan. Only the server (service role) writes.

-- Every new auth user gets a profile.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end; $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Atomic quota functions: no race conditions between parallel requests.
create function public.consume_visitor_scan(p_visitor uuid, p_limit int)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  insert into visitor_usage (visitor_id) values (p_visitor) on conflict do nothing;
  update visitor_usage set scans_used = scans_used + 1, updated_at = now()
    where visitor_id = p_visitor and scans_used < p_limit;
  return found;
end; $$;

create function public.consume_user_scan(p_user uuid, p_limit int) -- p_limit null = unlimited
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update profiles set scans_used = scans_used + 1
    where id = p_user and (p_limit is null or scans_used < p_limit);
  return found;
end; $$;

create function public.refund_scan(p_visitor uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is not null then
    update profiles set scans_used = greatest(scans_used - 1, 0) where id = p_user;
  elsif p_visitor is not null then
    update visitor_usage set scans_used = greatest(scans_used - 1, 0) where visitor_id = p_visitor;
  end if;
end; $$;

-- Security definer functions are callable through the API by default. Lock them to the server.
revoke execute on function public.consume_visitor_scan(uuid, int) from public, anon, authenticated;
revoke execute on function public.consume_user_scan(uuid, int) from public, anon, authenticated;
revoke execute on function public.refund_scan(uuid, uuid) from public, anon, authenticated;

grant execute on function public.consume_visitor_scan(uuid, int) to service_role;
grant execute on function public.consume_user_scan(uuid, int) to service_role;
grant execute on function public.refund_scan(uuid, uuid) to service_role;
