-- "התחברות עם צ1" for approved outside websites (OAuth 2 authorization code + PKCE; the portal is the
-- identity provider). A connected site gets a token that can read ONLY:
--   * the signed-in user (GET /api/connect/userinfo)
--   * the battalion directory, if the קב״מית allowed it for that site (GET /api/connect/people)
-- Sites keep their own data on their own servers.
--
-- Per the קב״מית's directive (/kabam), every NEW website suggestion also needs her separate approval
-- (kabam_status) before an admin can add it. Rows that existed before this migration keep
-- kabam_status = null ("approved before the directive").

alter table public.app_submissions
  add column connect           boolean not null default false, -- the site signs users in with the portal
  add column want_directory    boolean not null default false, -- the submitter asked for the directory
  add column directory_allowed boolean not null default false, -- granted by the קב״מית
  add column kabam_status      text check (kabam_status in ('pending', 'approved', 'rejected')),
  add column kabam_note        text check (char_length(kabam_note) <= 200),
  add column kabam_by          uuid references public.profiles(id) on delete set null,
  add column kabam_at          timestamptz;
alter table public.app_submissions alter column kabam_status set default 'pending';
-- GitHub repositories are a list for the admin, not websites: no קב״מית step.
update public.app_submissions set kabam_status = null where kind = 'github';

-- The קב״מית is a position (תפקיד). `key` marks positions the code relies on.
alter table public.positions add column key text unique;
insert into public.positions (name, description, scope, sort, key)
  values ('קב״מית', 'אבטחת מידע: אישור אתרים חיצוניים וגישה לרשימת אנשי הגדוד', 'battalion', 0, 'kabam')
  on conflict (name) do update set key = 'kabam';

-- One-time codes (60 s), access tokens (24 h) and remembered consents. Codes/tokens are stored hashed.
create table public.oauth_codes (
  code_hash      text primary key,
  site_id        uuid not null references public.app_submissions(id) on delete cascade,
  user_id        uuid not null references public.profiles(id) on delete cascade,
  redirect_uri   text not null,
  code_challenge text not null,
  directory      boolean not null,
  expires_at     timestamptz not null,
  created_at     timestamptz not null default now()
);

create table public.oauth_tokens (
  token_hash   text primary key,
  site_id      uuid not null references public.app_submissions(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  directory    boolean not null,
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);
create index oauth_tokens_user on public.oauth_tokens (user_id);
create index oauth_tokens_site on public.oauth_tokens (site_id);

create table public.oauth_consents (
  site_id    uuid not null references public.app_submissions(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  directory  boolean not null,
  granted_at timestamptz not null default now(),
  primary key (site_id, user_id)
);
create index oauth_consents_user on public.oauth_consents (user_id);

alter table public.oauth_codes enable row level security;
alter table public.oauth_tokens enable row level security;
alter table public.oauth_consents enable row level security;
revoke all on public.oauth_codes, public.oauth_tokens, public.oauth_consents from anon, authenticated;

-- Website suggestions still waiting for an admin now wait for the קב״מית first.
update public.app_submissions set kabam_status = 'pending' where kind = 'url' and status = 'pending';
