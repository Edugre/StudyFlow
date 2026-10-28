-- Courses and meeting schedules (CM-01–CM-07), owned by Supabase Auth users.
-- Ownership is enforced by row level security; clients never send owner_id.

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  code text,
  instructor text,
  semester text check (char_length(semester) between 1 and 100),
  location text,
  notes text,
  created_at timestamptz not null default clock_timestamp()
);
create index courses_owner_semester on public.courses(owner_id, semester);
create index courses_owner_created on public.courses(owner_id, created_at);

create table public.course_meetings (
  id bigint generated always as identity primary key,
  course_id uuid not null references public.courses(id) on delete cascade,
  day text not null check (day in ('mon','tue','wed','thu','fri','sat','sun')),
  start_time time(0) not null,
  end_time time(0) not null,
  check (end_time > start_time)
);
create index course_meetings_course on public.course_meetings(course_id);

-- Names are trimmed; blank semesters are stored as null.
create function public.normalize_course() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.name := btrim(new.name);
  new.semester := nullif(btrim(new.semester), '');
  return new;
end;
$$;
create trigger courses_normalize before insert or update on public.courses
for each row execute function public.normalize_course();

alter table public.courses enable row level security;
alter table public.course_meetings enable row level security;

create policy "Students manage their own courses" on public.courses
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "Students manage meetings of their own courses" on public.course_meetings
  for all to authenticated
  using (exists (
    select 1 from public.courses c
    where c.id = course_id and c.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.courses c
    where c.id = course_id and c.owner_id = (select auth.uid())
  ));

-- Explicit privileges: no anonymous access, and owner_id/id are never writable.
revoke all on public.courses, public.course_meetings from anon, authenticated;
grant select, delete on public.courses to authenticated;
grant insert (name, code, instructor, semester, location, notes) on public.courses to authenticated;
grant update (name, code, instructor, semester, location, notes) on public.courses to authenticated;
grant select, insert, delete on public.course_meetings to authenticated;

-- Replaces a course's whole schedule. Runs as the caller, so RLS applies.
-- Raises P0002 when the course is missing or owned by someone else.
create function public.replace_course_meetings(p_course_id uuid, p_meetings jsonb)
returns void
language plpgsql security invoker set search_path = '' as $$
declare
  meeting jsonb;
begin
  if not exists (select 1 from public.courses where id = p_course_id) then
    raise exception 'Course not found' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_meetings) is distinct from 'array' or jsonb_array_length(p_meetings) > 100 then
    raise exception 'Meetings must be a list of at most 100 entries' using errcode = '22023';
  end if;
  for meeting in select * from jsonb_array_elements(p_meetings) loop
    if jsonb_typeof(meeting) <> 'object'
      or jsonb_typeof(meeting->'startTime') is distinct from 'string'
      or jsonb_typeof(meeting->'endTime') is distinct from 'string'
      or meeting->>'startTime' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or meeting->>'endTime' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
      raise exception 'Invalid meeting time' using errcode = '22023';
    end if;
  end loop;
  delete from public.course_meetings where course_id = p_course_id;
  insert into public.course_meetings(course_id, day, start_time, end_time)
  select p_course_id, m->>'day', (m->>'startTime')::time, (m->>'endTime')::time
  from jsonb_array_elements(p_meetings) with ordinality as e(m, n)
  order by n;
end;
$$;

-- Creates a course and its schedule atomically; returns the new id.
create function public.create_course(
  p_name text,
  p_code text default null,
  p_instructor text default null,
  p_semester text default null,
  p_meetings jsonb default '[]'::jsonb
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  new_id uuid;
begin
  insert into public.courses(name, code, instructor, semester)
  values (p_name, p_code, p_instructor, p_semester)
  returning id into new_id;
  perform public.replace_course_meetings(new_id, p_meetings);
  return new_id;
end;
$$;

-- CM-06: replaces every editable field and the schedule atomically.
create function public.update_course(
  p_id uuid,
  p_name text,
  p_code text,
  p_instructor text,
  p_semester text,
  p_location text,
  p_notes text,
  p_meetings jsonb
) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  update public.courses
  set name = p_name, code = p_code, instructor = p_instructor,
      semester = p_semester, location = p_location, notes = p_notes
  where id = p_id;
  if not found then
    raise exception 'Course not found' using errcode = 'P0002';
  end if;
  perform public.replace_course_meetings(p_id, p_meetings);
end;
$$;

revoke execute on function public.replace_course_meetings(uuid, jsonb),
  public.create_course(text, text, text, text, jsonb),
  public.update_course(uuid, text, text, text, text, text, text, jsonb)
  from public, anon;
grant execute on function public.replace_course_meetings(uuid, jsonb),
  public.create_course(text, text, text, text, jsonb),
  public.update_course(uuid, text, text, text, text, text, text, jsonb)
  to authenticated;
