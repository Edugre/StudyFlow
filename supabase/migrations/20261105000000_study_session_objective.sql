-- SP-06: a study session can have an objective, what the student intends
-- to accomplish. It's optional; a blank objective is stored as none.

alter table public.study_sessions
  add column objective text check (char_length(objective) between 1 and 500);

create function public.normalize_study_session() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.objective := nullif(btrim(new.objective), '');
  return new;
end;
$$;
create trigger study_sessions_normalize before insert or update on public.study_sessions
for each row execute function public.normalize_study_session();

grant insert (objective), update (objective)
  on public.study_sessions to authenticated;
