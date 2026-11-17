-- Bahad portal — initial schema (plan section 06 — Data Model).
-- Runs on Supabase Postgres, on plain Postgres (Linux self-host, with
-- supabase/local/00_auth_shim.sql applied first) and on PGlite (local/tests).

create type public.user_role   as enum ('cadet', 'commander', 'admin');
create type public.user_status as enum ('pending', 'approved', 'blocked');

create table public.companies (
  id   uuid primary key default gen_random_uuid(),
  name text not null unique check (length(btrim(name)) between 1 and 40),
  sort int  not null default 0
);

create table public.platoons (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  name       text not null check (length(btrim(name)) between 1 and 40),
  unique (company_id, name)
);

create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text not null,
  full_name    text,
  avatar_url   text,
  phone        text,
  company_id   uuid references public.companies(id),
  platoon_id   uuid references public.platoons(id),
  role         public.user_role   not null default 'cadet',
  status       public.user_status not null default 'pending',
  onboarded_at timestamptz,
  created_at   timestamptz not null default now(),
  approved_at  timestamptz,
  approved_by  uuid references public.profiles(id) on delete set null,
  last_seen_at timestamptz
);
create index profiles_status  on public.profiles (status);
create index profiles_company on public.profiles (company_id);
create index profiles_platoon on public.profiles (platoon_id);

-- A platoon must belong to the profile's company.
create function public.check_profile_unit() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.platoon_id is not null then
    if new.company_id is null or not exists (
      select 1 from public.platoons p
      where p.id = new.platoon_id and p.company_id = new.company_id
    ) then
      raise exception 'platoon does not belong to company' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
create trigger profiles_unit_check before insert or update of company_id, platoon_id
  on public.profiles for each row execute function public.check_profile_unit();

create table public.app_records (
  id          uuid primary key default gen_random_uuid(),
  app_slug    text not null,
  collection  text not null,
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  data        jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 16384),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index app_records_lookup on public.app_records (app_slug, collection, created_at desc);
create index app_records_owner  on public.app_records (app_slug, collection, owner_id);
create index app_records_data   on public.app_records using gin (data jsonb_path_ops);

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger app_records_touch before update on public.app_records
  for each row execute function public.touch_updated_at();

create table public.app_overrides (
  app_slug   text primary key,
  status     text not null check (status in ('hidden', 'disabled')),
  reason     text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user on public.push_subscriptions (user_id);

create table public.push_queue (
  id         uuid primary key default gen_random_uuid(),
  batch_id   uuid not null,                 -- one bahad.push.notify() call
  app_slug   text not null,
  sender_id  uuid references public.profiles(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  title      text not null,
  body       text,
  url        text,
  send_at    timestamptz not null default now(),
  sent_at    timestamptz,
  error      text
);
create index push_queue_due   on public.push_queue (send_at) where sent_at is null;
create index push_queue_batch on public.push_queue (batch_id);

-- Fixed-window counters for rate limits and quotas (works across serverless instances).
create table public.rate_counters (
  key          text        not null,
  window_start timestamptz not null,
  count        int         not null default 0,
  primary key (key, window_start)
);

create table public.audit_log (
  id       bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action   text not null,          -- 'user.approve', 'user.role', 'app.disable', …
  target   text,
  details  jsonb,
  at       timestamptz not null default now()
);
create index audit_log_at on public.audit_log (at desc);

-- New auth user → profile row (status pending). Data comes from Google.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  )
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Row Level Security ────────────────────────────────────────────────────────
-- Enabled on every table. Server code connects as the table owner (bypasses RLS)
-- and applies the rules itself. Browsers (anon / authenticated roles) may only
-- read their own profile row.
alter table public.companies          enable row level security;
alter table public.platoons           enable row level security;
alter table public.profiles           enable row level security;
alter table public.app_records        enable row level security;
alter table public.app_overrides      enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.push_queue         enable row level security;
alter table public.rate_counters      enable row level security;
alter table public.audit_log          enable row level security;

create policy "read own profile" on public.profiles
  for select to authenticated using (id = (select auth.uid()));

-- Defense in depth on top of RLS: no direct browser privileges except reading profiles.
revoke all on public.companies, public.platoons, public.app_records, public.app_overrides,
  public.push_subscriptions, public.push_queue, public.rate_counters, public.audit_log
  from anon, authenticated;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ── Supabase Realtime: private "collection changed" signals ──────────────────
-- Topic: bahad:<app_slug>:<collection>. Payload is always empty, so the only
-- thing an approved user can learn is "something changed". Skipped where the
-- realtime schema does not exist (plain Postgres / PGlite).
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'realtime' and table_name = 'messages') then
    execute $p$
      create policy "approved users receive bahad signals" on realtime.messages
        for select to authenticated
        using (
          realtime.topic() like 'bahad:%'
          and exists (select 1 from public.profiles p
                      where p.id = (select auth.uid()) and p.status = 'approved')
        )
    $p$;
  end if;
end $$;
