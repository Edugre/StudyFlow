-- AT-04: every task is an assignment, exam, quiz, or project.
-- Existing rows become assignments through the default.

alter table public.assignments
  add column kind text not null default 'assignment'
  check (kind in ('assignment', 'exam', 'quiz', 'project'));

grant insert (kind), update (kind) on public.assignments to authenticated;
