-- Re-applies what a `pg_dump --schema=public --no-privileges` restore does not contain:
-- the auth.users trigger, the defense-in-depth grants, and the Realtime policy.
-- Idempotent. Appended to every backup by scripts/backup.sh; can also be run by hand.

create or replace trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

revoke all on public.companies, public.platoons, public.app_records, public.app_overrides,
  public.push_subscriptions, public.push_queue, public.rate_counters, public.audit_log, public.app_managers, public.app_submissions
  from anon, authenticated;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'realtime' and table_name = 'messages')
     and not exists (select 1 from pg_policies where schemaname = 'realtime' and tablename = 'messages'
                     and policyname = 'approved users receive bahad signals') then
    execute $p$
      create policy "approved users receive bahad signals" on realtime.messages
        for select to authenticated
        using (
          realtime.topic() like 'bahad:%'
          and exists (select 1 from public.profiles p
                      where p.id = (select auth.uid()) and p.status = 'approved')
        )
    $p$;
  end if;
end $$;
