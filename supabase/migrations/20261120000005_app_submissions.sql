-- "הוספת אפליקציה": anyone approved suggests an outside website (kind 'url') or a GitHub repository
-- (kind 'github'). An admin approves or rejects. Approved websites appear in the portal's app grid
-- as link tiles (they open in a new tab — no framing, no Platform API). Approved GitHub repositories
-- are only kept as a list for the admin; nothing is built or run from them.
create table public.app_submissions (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('url', 'github')),
  name         text not null check (char_length(name) between 1 and 30),
  description  text not null default '' check (char_length(description) <= 120),
  url          text not null check (char_length(url) <= 300 and url ~ '^https://'),
  emoji        text not null default '🔗' check (char_length(emoji) <= 16),
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_note  text check (char_length(review_note) <= 200),
  submitted_by uuid references public.profiles(id) on delete set null,
  reviewed_by  uuid references public.profiles(id) on delete set null,
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index app_submissions_status on public.app_submissions (status, kind, created_at desc);
create index app_submissions_submitter on public.app_submissions (submitted_by, created_at desc);

alter table public.app_submissions enable row level security;
revoke all on public.app_submissions from anon, authenticated;
