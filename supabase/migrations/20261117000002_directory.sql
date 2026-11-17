-- User directory (owner decision 2026-11-17): every approved user can open every other
-- approved user's profile. Each person may hide their phone and/or email (default: shown).
alter table public.profiles add column show_phone boolean not null default true;
alter table public.profiles add column show_email boolean not null default true;
