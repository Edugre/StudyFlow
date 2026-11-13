-- Store each student's preferred time zone for reminder scheduling.

alter table public.student_settings
  add column time_zone text not null default 'UTC';

-- Require a non-empty time-zone identifier.
alter table public.student_settings
  add constraint student_settings_time_zone_check
  check (char_length(btrim(time_zone)) between 1 and 100);

-- Allow students to save their time-zone preference.
grant insert (time_zone)
  on public.student_settings to authenticated;

grant update (time_zone)
  on public.student_settings to authenticated;
