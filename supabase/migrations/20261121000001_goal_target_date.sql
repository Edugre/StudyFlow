-- GP-02: a goal can have an optional target date, as a local calendar date.
alter table public.goals add column target_date date;

grant insert (target_date), update (target_date) on public.goals to authenticated;
