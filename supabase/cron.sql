-- Scheduled jobs on Supabase (plan 06 — Scheduled jobs). Run ONCE per Supabase project
-- (SQL editor), after replacing the two placeholders. Not a migration on purpose:
-- the URL and secret differ per project (prod / dev) and must not live in the repo.
--
--   <SITE_URL>     e.g. https://alon-portal.vercel.app   (no trailing slash)
--   <CRON_SECRET>  the same value as the CRON_SECRET environment variable of the site
--
-- On a Linux box without Supabase use the systemd timers in deploy/linux/ instead (LINUX.md).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Keep the secret in Supabase Vault, not in the job text.
select vault.create_secret('<CRON_SECRET>', 'bahad_cron_secret', 'shared secret for /api/cron/*');

-- Every minute: send due push notifications.
select cron.schedule(
  'bahad-push',
  '* * * * *',
  $$
  select net.http_post(
    url := '<SITE_URL>/api/cron/push',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'bahad_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $$
);

-- Daily 03:15 UTC: delete sent push rows older than 30 days and old rate-limit counters.
select cron.schedule(
  'bahad-daily',
  '15 3 * * *',
  $$
  delete from public.push_queue where sent_at is not null and sent_at < now() - interval '30 days';
  delete from public.rate_counters where window_start < now() - interval '2 days';
  $$
);

-- Check:   select * from cron.job;   select * from cron.job_run_details order by start_time desc limit 20;
-- Remove:  select cron.unschedule('bahad-push'); select cron.unschedule('bahad-daily');
