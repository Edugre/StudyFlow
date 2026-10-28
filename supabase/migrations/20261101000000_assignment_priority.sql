-- AT-05: every task has a Low, Medium, or High priority.
-- Existing rows become Medium through the default.

alter table public.assignments
  add column priority text not null default 'medium'
  check (priority in ('low', 'medium', 'high'));

grant insert (priority), update (priority) on public.assignments to authenticated;
