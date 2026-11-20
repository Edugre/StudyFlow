-- RN-06: students can turn reminders off for one task.
-- A task with reminders off gets no new reminders and no overdue notice.
-- Every other task keeps its own setting, so turning one task off never
-- silences another. Notifications already delivered stay in the history.

alter table public.assignments
  add column reminders_enabled boolean not null default true;

grant insert (reminders_enabled), update (reminders_enabled)
  on public.assignments to authenticated;

-- Same as 20261118000000_overdue_notifications.sql, with each task check
-- also requiring the task's own reminders to be on.
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
      and a.reminders_enabled
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
      and a.reminders_enabled
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
    and a.reminders_enabled
    and coalesce(s.overdue_notifications_enabled, true)
    and event_time.event_at <= now()
    and event_time.event_at > now() - interval '1 day'

  on conflict (owner_id, source_type, source_id)
  do nothing;
end;
$$;
