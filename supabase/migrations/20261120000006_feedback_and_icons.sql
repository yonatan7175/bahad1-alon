-- "שינויים ושיפורים": any approved user sends a complaint / request / idea to the site admins.
-- Admins see everything, mark it handled and can reply; the sender sees their own messages and the reply.
create table public.feedback (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null default 'idea' check (kind in ('idea', 'bug', 'complaint', 'other')),
  body        text not null check (char_length(body) between 3 and 1500),
  status      text not null default 'open' check (status in ('open', 'done')),
  reply       text check (char_length(reply) <= 500),
  author_id   uuid references public.profiles(id) on delete set null,
  handled_by  uuid references public.profiles(id) on delete set null,
  handled_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index feedback_status on public.feedback (status, created_at desc);
create index feedback_author on public.feedback (author_id, created_at desc);
alter table public.feedback enable row level security;
revoke all on public.feedback from anon, authenticated;

-- "הוספת אפליקציה": an optional uploaded tile image (small raster data URL, validated on the server).
alter table public.app_submissions add column icon text check (icon is null or (char_length(icon) <= 120000 and icon ~ '^data:image/(png|jpeg|webp);base64,'));
