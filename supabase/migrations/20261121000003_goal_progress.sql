-- GP-04: a goal's progress, as a whole percentage from 0 through 100.
alter table public.goals
  add column progress smallint not null default 0
  check (progress between 0 and 100);

-- Update only: new goals always start at 0%.
grant update (progress) on public.goals to authenticated;
