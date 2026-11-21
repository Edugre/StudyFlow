-- RN-05: a notification when a task becomes overdue.
-- Once an open task's deadline passes, the next reminder check creates one
-- "Task overdue" notification naming the task and the deadline it missed.
-- Completed tasks never get one, and every task type can become overdue.
--
-- Only deadlines missed within the last day are reported. A check that runs
-- late still catches up, but tasks that were overdue long before this
-- feature existed do not flood a student with old notices.

-- Overdue notices are their own source type, so a task can have both its
-- reminder and its overdue notice (one notification per source type).
alter table public.notifications
  drop constraint notifications_source_type_check,
  add constraint notifications_source_type_check
    check (source_type in ('assignment', 'exam', 'study_session', 'overdue'));

-- Overdue notifications are on unless the student turns them off.
alter table public.student_settings
  add column overdue_notifications_enabled boolean not null default true;

grant insert (overdue_notifications_enabled), update (overdue_notifications_enabled)
  on public.student_settings to authenticated;

-- Same as 20261114000002_generate_reminders.sql, plus the overdue check at
-- the end.
create or replace function public.generate_reminders()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  with candidates as (

    -- RN-01: Assignment reminders.
    select
      a.owner_id,
      'assignment'::text as source_type,
      a.id as source_id,
      event_time.event_at,
      event_time.event_at
        - make_interval(
            mins => coalesce(s.reminder_lead_minutes, 60)
          ) as reminder_at,
      'Assignment reminder'::text as title,
      format(
        '%s is due %s.',
        a.title,
        to_char(
          event_time.event_at at time zone
            coalesce(nullif(s.time_zone, ''), 'UTC'),
          'Mon DD, YYYY HH12:MI AM'
        )
      ) as message
    from public.assignments a
    left join public.student_settings s
      on s.owner_id = a.owner_id
    cross join lateral (
      select (
        (
          a.due_on
          + coalesce(a.due_time, time '23:59:59')
        ) at time zone coalesce(nullif(s.time_zone, ''), 'UTC')
      ) as event_at
    ) event_time
    where a.kind = 'assignment'
      and a.due_on is not null
      and a.completed_at is null
      and coalesce(s.assignment_reminders_enabled, true)

    union all

    -- RN-02: Exam reminders.
    -- Exams are stored as assignments with kind = 'exam'.
    select
      a.owner_id,
      'exam'::text as source_type,
      a.id as source_id,
      event_time.event_at,
      event_time.event_at
        - make_interval(
            mins => coalesce(s.reminder_lead_minutes, 60)
          ) as reminder_at,
      'Exam reminder'::text as title,
      format(
        '%s is scheduled for %s.',
        a.title,
        to_char(
          event_time.event_at at time zone
            coalesce(nullif(s.time_zone, ''), 'UTC'),
          'Mon DD, YYYY HH12:MI AM'
        )
      ) as message
    from public.assignments a
    left join public.student_settings s
      on s.owner_id = a.owner_id
    cross join lateral (
      select (
        (
          a.due_on
          + coalesce(a.due_time, time '23:59:59')
        ) at time zone coalesce(nullif(s.time_zone, ''), 'UTC')
      ) as event_at
    ) event_time
    where a.kind = 'exam'
      and a.due_on is not null
      and a.completed_at is null
      and coalesce(s.exam_reminders_enabled, true)

    union all

    -- RN-03: Study-session reminders.
    select
      ss.owner_id,
      'study_session'::text as source_type,
      ss.id as source_id,
      event_time.event_at,
      event_time.event_at
        - make_interval(
            mins => coalesce(s.reminder_lead_minutes, 60)
          ) as reminder_at,
      'Study session reminder'::text as title,
      format(
        'Your study session is scheduled for %s.',
        to_char(
          event_time.event_at at time zone
            coalesce(nullif(s.time_zone, ''), 'UTC'),
          'Mon DD, YYYY HH12:MI AM'
        )
      ) as message
    from public.study_sessions ss
    left join public.student_settings s
      on s.owner_id = ss.owner_id
    cross join lateral (
      select (
        (
          ss.starts_on + ss.start_time
        ) at time zone coalesce(nullif(s.time_zone, ''), 'UTC')
      ) as event_at
    ) event_time
    where ss.completed_at is null
      and ss.canceled_at is null
      and coalesce(s.study_session_reminders_enabled, true)
  )

  insert into public.notifications (
    owner_id,
    source_type,
    source_id,
    scheduled_for,
    title,
    message
  )
  select
    owner_id,
    source_type,
    source_id,
    reminder_at,
    title,
    message
  from candidates
  where event_at > now()
    and reminder_at <= now()

  on conflict (owner_id, source_type, source_id)
  do nothing;

  -- RN-05: Overdue notices for open tasks whose deadline has just passed.
  -- A date-only deadline passes at the end of its day.
  insert into public.notifications (
    owner_id,
    source_type,
    source_id,
    scheduled_for,
    title,
    message
  )
  select
    a.owner_id,
    'overdue',
    a.id,
    event_time.event_at,
    'Task overdue',
    format(
      '%s was due %s.',
      a.title,
      to_char(
        event_time.event_at at time zone
          coalesce(nullif(s.time_zone, ''), 'UTC'),
        'Mon DD, YYYY HH12:MI AM'
      )
    )
  from public.assignments a
  left join public.student_settings s
    on s.owner_id = a.owner_id
  cross join lateral (
    select (
      (
        a.due_on
        + coalesce(a.due_time, time '23:59:59')
      ) at time zone coalesce(nullif(s.time_zone, ''), 'UTC')
    ) as event_at
  ) event_time
  where a.due_on is not null
    and a.completed_at is null
    and coalesce(s.overdue_notifications_enabled, true)
    and event_time.event_at <= now()
    and event_time.event_at > now() - interval '1 day'

  on conflict (owner_id, source_type, source_id)
  do nothing;
end;
$$;

-- RN-09: completing a task also withdraws its unread overdue notice.
create or replace function public.cancel_completed_assignment_reminders() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.notifications
  where owner_id = new.owner_id
    and source_type in ('assignment', 'exam', 'overdue')
    and source_id = new.id
    and read_at is null;
  return null;
end;
$$;

-- RN-10: overdue notices name the course of their task, like reminders do.
create or replace function public.label_notification_course() returns trigger
language plpgsql set search_path = '' as $$
declare
  course_name text;
begin
  if new.source_type in ('assignment', 'exam', 'overdue') then
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
