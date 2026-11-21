-- Positions (תפקידים): jobs like קא"ר / קל"פ / קל"ג that give their holders manager powers in the
-- apps of their area. A user may hold several. A user REQUESTS a position; an admin approves it
-- (or assigns it directly). Separate from profiles.role (cadet / commander / admin), which stays as is.
--
--   positions         the list (admins edit it)
--   position_apps     which apps each position manages: 'app:<slug>' (built-in app) or
--                     'link:<app_submissions.id>' (an approved website, e.g. מדיקלוד)
--   position_holders  who holds / asked for which position
--
-- A position is גדודי (scope 'battalion') or פלוגתי (scope 'company'). A פלוגתי holding is tied to ONE
-- company (position_holders.company_id: the holder's company when they asked / were appointed), and is
-- shown as e.g. 'קל"פ · פלוגה א''.
--
-- In a built-in app, an APPROVED holder counts as a manager of that app: גדודי → moderates its
-- collections battalion-wide (same as public.app_managers); פלוגתי → only records of people in the
-- holding's company. For websites the position is recorded only (it will be sent
-- to the site at sign-in once the portal offers shared login).
create table public.positions (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (char_length(name) between 1 and 30),
  description text not null default '' check (char_length(description) <= 200),
  scope       text not null default 'battalion' check (scope in ('battalion', 'company')),
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);

create table public.position_apps (
  position_id uuid not null references public.positions(id) on delete cascade,
  app_ref     text not null check (app_ref ~ '^(app:[a-z0-9][a-z0-9-]{0,39}|link:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$'),
  primary key (position_id, app_ref)
);
create index position_apps_ref on public.position_apps (app_ref);

create table public.position_holders (
  position_id  uuid not null references public.positions(id) on delete cascade,
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  company_id   uuid references public.companies(id) on delete cascade, -- פלוגתי positions only
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reason       text check (char_length(reason) <= 200),       -- the requester's note
  review_note  text check (char_length(review_note) <= 200),  -- the admin's note (e.g. why rejected)
  requested_at timestamptz not null default now(),
  reviewed_by  uuid references public.profiles(id) on delete set null,
  reviewed_at  timestamptz,
  primary key (position_id, profile_id)
);
create index position_holders_profile on public.position_holders (profile_id, status);
create index position_holders_pending on public.position_holders (status, requested_at);

alter table public.positions enable row level security;
alter table public.position_apps enable row level security;
alter table public.position_holders enable row level security;
revoke all on public.positions, public.position_apps, public.position_holders from anon, authenticated;

-- The first positions. Logistics → the logistics apps; קא"ר → the מדיקלוד website when it exists.
insert into public.positions (name, description, scope, sort) values
  ('קא"ר', 'ניהול מדיקלוד', 'company', 1),
  ('קל"פ', 'ניהול אפליקציות הלוגיסטיקה (מגורים, כביסה) בפלוגה', 'company', 2),
  ('קל"ג', 'ניהול אפליקציות הלוגיסטיקה (מגורים, כביסה) בגדוד', 'battalion', 3);

insert into public.position_apps (position_id, app_ref)
  select p.id, a.ref from public.positions p
    cross join (values ('app:dorm'), ('app:laundry')) as a(ref)
   where p.name in ('קל"פ', 'קל"ג');

insert into public.position_apps (position_id, app_ref)
  select p.id, 'link:' || s.id from public.positions p
    join public.app_submissions s on s.kind = 'url' and s.status = 'approved' and s.name like 'מדיקלוד%'
   where p.name = 'קא"ר';
