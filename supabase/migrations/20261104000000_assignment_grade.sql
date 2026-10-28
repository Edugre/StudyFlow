-- AT-10: a completed task can hold a percentage grade from 0 through 100.
-- Completion can't be undone (AT-06), so a graded task stays completed.

alter table public.assignments
  add column grade numeric(5,2)
    check (grade between 0 and 100),
  add constraint assignments_grade_needs_completion
    check (grade is null or completed_at is not null);

-- Update only: new tasks start incomplete, so they can't have a grade yet.
grant update (grade) on public.assignments to authenticated;
