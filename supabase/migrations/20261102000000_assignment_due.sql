-- AT-03: a task's deadline is a date with an optional time.
-- Times are local wall time, like study sessions (timezone pending team review).

alter table public.assignments
  add column due_on date,
  add column due_time time(0),
  add constraint assignments_due_time_needs_date
    check (due_time is null or due_on is not null);

grant insert (due_on, due_time), update (due_on, due_time)
  on public.assignments to authenticated;
