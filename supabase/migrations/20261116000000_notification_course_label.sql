-- RN-10: reminders name the course their task or study session belongs to.
-- generate_reminders() already writes the task title and deadline; this puts
-- the course name in front, so tasks that share a title in different courses
-- can be told apart. Reminders for work without a course are left as written.
-- The label is the course as it was when the reminder was created, like the
-- title and deadline beside it.

create function public.label_notification_course() returns trigger
language plpgsql set search_path = '' as $$
declare
  course_name text;
begin
  if new.source_type in ('assignment', 'exam') then
    select c.name into course_name
    from public.assignments a
    join public.courses c on c.id = a.course_id and c.owner_id = a.owner_id
    where a.id = new.source_id and a.owner_id = new.owner_id;
  elsif new.source_type = 'study_session' then
    select c.name into course_name
    from public.study_sessions s
    join public.courses c on c.id = s.course_id and c.owner_id = s.owner_id
    where s.id = new.source_id and s.owner_id = new.owner_id;
  end if;

  -- Messages hold at most 500 characters. A reminder that would not fit keeps
  -- its original text rather than failing the whole reminder run.
  if char_length(course_name || ': ' || new.message) <= 500 then
    new.message := course_name || ': ' || new.message;
  end if;
  return new;
end;
$$;

create trigger notifications_label_course before insert on public.notifications
for each row execute function public.label_notification_course();
