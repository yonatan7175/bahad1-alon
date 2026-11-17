-- Cadet details collected at onboarding: room number (new column) and the battalion's
-- five companies (פלוגה א'–ה'). The team number is stored as a platoon named "צוות <n>"
-- under the chosen company (created on first use), so audiences/permissions by platoon keep working.
alter table public.profiles add column room text
  check (room is null or room ~ '^[0-9A-Za-zא-ת/\-]{1,8}$');

insert into public.companies (name, sort) values
  ('פלוגה א''', 1), ('פלוגה ב''', 2), ('פלוגה ג''', 3), ('פלוגה ד''', 4), ('פלוגה ה''', 5)
on conflict (name) do nothing;
