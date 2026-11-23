-- Username + password sign-in (BAHAD_AUTH=google only; next to "sign in with Google").
-- One row per password identity. The identity itself is an auth.users row like a Google one, so the
-- insert trigger creates the pending profile and the user then fills in the same registration form
-- (פלוגה, צוות, חדר, טלפון). The password is stored only as a scrypt hash.
create table public.password_logins (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  username      text not null unique check (username ~ '^[a-z0-9][a-z0-9._-]{2,19}$'),
  password_hash text not null,
  failed_count  int not null default 0,
  locked_until  timestamptz,
  created_at    timestamptz not null default now()
);

alter table public.password_logins enable row level security;
revoke all on public.password_logins from anon, authenticated;
