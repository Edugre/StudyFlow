
-- RN-01, RN-02, RN-03: Generate in-app reminders for upcoming events.
--
-- This function is intended to run periodically through Supabase Cron.
-- It reads current event data each time it runs, so rescheduled events
-- use their updated date and time.

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
end;
$$;

-- Only the database owner/scheduler should execute this function.
revoke all on function public.generate_reminders()
  from public, anon, authenticated;

-- Enable Supabase Cron for recurring reminder generation.
create extension if not exists pg_cron with schema pg_catalog;

-- Allow the database owner to manage scheduled jobs.
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- Generate reminders once per minute.
select cron.schedule(
  'studyflow-generate-reminders',
  '* * * * *',
  'select public.generate_reminders();'
);
