-- GP-05: a goal is completed once, at a time the database records.
-- Completing again changes nothing, so a goal is never counted twice, and
-- completion cannot be undone (as for tasks and study sessions). A completed
-- goal is at 100% and its progress no longer changes.

alter table public.goals add column completed_at timestamptz;

create function public.protect_goal_completion() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.completed_at is not null then
    new.completed_at := old.completed_at;
    new.progress := old.progress;
  elsif new.completed_at is not null then
    new.completed_at := clock_timestamp();
    new.progress := 100;
  end if;
  return new;
end;
$$;
create trigger goals_protect_completion before update on public.goals
for each row execute function public.protect_goal_completion();

-- Update only: new goals always start active.
grant update (completed_at) on public.goals to authenticated;
