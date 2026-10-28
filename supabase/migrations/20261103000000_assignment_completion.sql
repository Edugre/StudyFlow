-- AT-06: a task is completed once, at a time the database records.
-- Completing again changes nothing, so a task is never counted twice.
-- Undoing completion is not part of the card and is not allowed.

alter table public.assignments add column completed_at timestamptz;

create function public.protect_assignment_completion() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.completed_at is not null then
    new.completed_at := old.completed_at;
  elsif new.completed_at is not null then
    new.completed_at := clock_timestamp();
  end if;
  return new;
end;
$$;
create trigger assignments_protect_completion before update on public.assignments
for each row execute function public.protect_assignment_completion();

-- Update only: new tasks always start incomplete.
grant update (completed_at) on public.assignments to authenticated;
