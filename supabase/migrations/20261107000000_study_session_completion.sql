-- SP-09: a study session is completed once, at a time the database records.
-- Completing again changes nothing, so a session is never counted twice.
-- Undoing completion is not part of the card and is not allowed (as AT-06).

alter table public.study_sessions add column completed_at timestamptz;

create function public.protect_study_session_completion() returns trigger
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
create trigger study_sessions_protect_completion before update on public.study_sessions
for each row execute function public.protect_study_session_completion();

-- Update only: new sessions always start unfinished.
grant update (completed_at) on public.study_sessions to authenticated;
