-- App managers: users an admin lets moderate ONE app's collections battalion-wide
-- (e.g. the battalion logistics officer for the dorm app) without making them site admins.
-- The engine treats a manager of an app like an admin for that app's moderation only
-- (collections whose "moderate" is not "none").
create table public.app_managers (
  app_slug   text not null,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (app_slug, profile_id)
);
create index app_managers_profile on public.app_managers (profile_id);

alter table public.app_managers enable row level security;
revoke all on public.app_managers from anon, authenticated;
