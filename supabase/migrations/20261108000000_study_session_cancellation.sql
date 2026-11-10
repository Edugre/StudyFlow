-- SP-08: a study session can be canceled. It stays saved, so progress
-- (GP-07, GP-08) can leave canceled sessions out, but it leaves the
-- schedule. Like completion (SP-09), the database records its own time,
-- canceling again changes nothing, and it can't be undone.
-- A session is completed or canceled, never both.

alter table public.study_sessions
  add column canceled_at timestamptz,
  add constraint study_sessions_completed_or_canceled
    check (completed_at is null or canceled_at is null);

create function public.protect_study_session_cancellation() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.canceled_at is not null then
    new.canceled_at := old.canceled_at;
  elsif new.canceled_at is not null then
    new.canceled_at := clock_timestamp();
  end if;
  return new;
end;
$$;
create trigger study_sessions_protect_cancellation before update on public.study_sessions
for each row execute function public.protect_study_session_cancellation();

-- Update only: new sessions always start scheduled.
grant update (canceled_at) on public.study_sessions to authenticated;
