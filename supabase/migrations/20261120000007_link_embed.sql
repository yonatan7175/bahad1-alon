-- "הוספת אפליקציה": approved websites can open INSIDE the portal (in the external-app frame) instead of
-- a new tab. The server probes each site (X-Frame-Options / CSP frame-ancestors) and stores the result:
--   embed_url   the final https URL (after redirects) that may be framed, or null when the site refuses framing
--   embed_note  why (Hebrew, shown to the admin)
--   embed_mode  'auto' = follow the probe, 'frame' / 'tab' = the admin's override
alter table public.app_submissions
  add column embed_url        text check (embed_url is null or (char_length(embed_url) <= 600 and embed_url ~ '^https://')),
  add column embed_note       text check (embed_note is null or char_length(embed_note) <= 200),
  add column embed_checked_at timestamptz,
  add column embed_mode       text not null default 'auto' check (embed_mode in ('auto', 'frame', 'tab'));
