-- Minimal assignments (AT-01) and study sessions (SP-01), each optionally
-- linked to one of the student's courses (CM-10, AT-02, SP-02).
-- Deleting a course unlinks its coursework instead of deleting it.

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  course_id uuid references public.courses(id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  created_at timestamptz not null default clock_timestamp()
);
create index assignments_owner_course on public.assignments(owner_id, course_id);

-- Times are local wall time, like course meetings (timezone pending team review).
create table public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  course_id uuid references public.courses(id) on delete set null,
  starts_on date not null,
  start_time time(0) not null,
  duration_minutes integer not null check (duration_minutes between 1 and 1440),
  created_at timestamptz not null default clock_timestamp()
);
create index study_sessions_owner_course on public.study_sessions(owner_id, course_id);

create function public.normalize_assignment() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.title := btrim(new.title);
  return new;
end;
$$;
create trigger assignments_normalize before insert or update on public.assignments
for each row execute function public.normalize_assignment();

alter table public.assignments enable row level security;
alter table public.study_sessions enable row level security;

-- The foreign key alone would accept another student's course id, so links
-- must also point at a course the student owns.
create policy "Students manage their own assignments" on public.assignments
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and (course_id is null or exists (
      select 1 from public.courses c
      where c.id = course_id and c.owner_id = (select auth.uid())
    ))
  );

create policy "Students manage their own study sessions" on public.study_sessions
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and (course_id is null or exists (
      select 1 from public.courses c
      where c.id = course_id and c.owner_id = (select auth.uid())
    ))
  );

-- Explicit privileges: no anonymous access, and owner_id/id are never writable.
revoke all on public.assignments, public.study_sessions from anon, authenticated;
grant select, delete on public.assignments, public.study_sessions to authenticated;
grant insert (course_id, title), update (course_id, title)
  on public.assignments to authenticated;
grant insert (course_id, starts_on, start_time, duration_minutes),
  update (course_id, starts_on, start_time, duration_minutes)
  on public.study_sessions to authenticated;
