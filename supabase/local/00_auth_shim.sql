-- Minimal stand-in for the parts of Supabase that the migrations reference.
-- Applied ONLY when the database is NOT Supabase:
--   * local development and tests (PGlite)
--   * a plain Postgres on a Linux server (see LINUX.md)
-- Never run this against a Supabase project.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end $$;

create schema if not exists auth;

create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  banned_until       timestamptz,
  created_at         timestamptz not null default now()
);

-- Direct Google sign-in (BAHAD_AUTH=google): one identity per Google account (stable "sub").
create unique index if not exists users_google_sub_key on auth.users ((raw_user_meta_data ->> 'google_sub'))
  where raw_user_meta_data ? 'google_sub';

-- Same contract as Supabase: the signed-in user's id from the request JWT claims.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claim.sub', true),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ), ''
  )::uuid
$$;

grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;

-- Mimic Supabase's default grants so that RLS (not missing grants) is what protects data.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
