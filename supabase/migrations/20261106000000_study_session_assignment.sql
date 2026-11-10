-- SP-03: a study session can prepare for one of the student's tasks
-- (assignment, exam, quiz or project).
-- When both the session and its task have a course, the courses must agree.
-- Moving a task to another course moves its linked sessions with it, so they
-- never disagree. Deleting a task keeps its sessions, unlinked (as AT-08 and
-- course deletion in CM-10 do).

alter table public.study_sessions
  add column assignment_id uuid references public.assignments(id) on delete set null;
create index study_sessions_assignment on public.study_sessions(assignment_id);

-- Runs as the student, so row level security hides other students' tasks:
-- a task they can't see reads as not found, like a deleted one.
create function public.check_study_session_assignment() returns trigger
language plpgsql set search_path = '' as $$
declare
  task_course uuid;
begin
  if new.assignment_id is null then
    return new;
  end if;
  select a.course_id into task_course
  from public.assignments a where a.id = new.assignment_id;
  if not found then
    raise exception 'task not found' using errcode = 'P0002';
  end if;
  if new.course_id is not null and task_course is not null
     and new.course_id <> task_course then
    raise exception 'the session''s course does not match its task''s course'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger study_sessions_check_assignment
before insert or update of assignment_id, course_id on public.study_sessions
for each row execute function public.check_study_session_assignment();

create function public.move_assignment_sessions() returns trigger
language plpgsql set search_path = '' as $$
begin
  update public.study_sessions
  set course_id = new.course_id
  where assignment_id = new.id and course_id is distinct from new.course_id;
  return null;
end;
$$;
create trigger assignments_move_sessions
after update of course_id on public.assignments
for each row when (old.course_id is distinct from new.course_id)
execute function public.move_assignment_sessions();

-- The foreign key alone would accept another student's task, so the policy
-- also requires the task to be the student's (the trigger checks it first,
-- with a clearer error).
drop policy "Students manage their own study sessions" on public.study_sessions;
create policy "Students manage their own study sessions" on public.study_sessions
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and (course_id is null or exists (
      select 1 from public.courses c
      where c.id = course_id and c.owner_id = (select auth.uid())
    ))
    and (assignment_id is null or exists (
      select 1 from public.assignments a
      where a.id = assignment_id and a.owner_id = (select auth.uid())
    ))
  );

grant insert (assignment_id), update (assignment_id)
  on public.study_sessions to authenticated;
