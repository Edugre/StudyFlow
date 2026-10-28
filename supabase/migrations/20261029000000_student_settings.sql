-- CM-08: each student's chosen current semester. Semesters stay free-text
-- labels, so "current" is whichever label the student picks; nothing is
-- inferred from dates.

create table public.student_settings (
  owner_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  current_semester text check (char_length(current_semester) between 1 and 100)
);

-- Blank selections are stored as null, matching course semesters.
create function public.normalize_student_settings() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.current_semester := nullif(btrim(new.current_semester), '');
  return new;
end;
$$;
create trigger student_settings_normalize before insert or update on public.student_settings
for each row execute function public.normalize_student_settings();

alter table public.student_settings enable row level security;

create policy "Students manage their own settings" on public.student_settings
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- owner_id is never writable; it always comes from the session.
revoke all on public.student_settings from anon, authenticated;
grant select on public.student_settings to authenticated;
grant insert (current_semester) on public.student_settings to authenticated;
grant update (current_semester) on public.student_settings to authenticated;
