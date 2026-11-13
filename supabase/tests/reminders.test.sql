
-- RN-01, RN-02, RN-03: Reminder generation tests.
begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

-- Configure the first student as the authenticated user.
set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}',
  true
);

-- Give the student a known time zone and reminder preferences.
insert into public.student_settings (
  assignment_reminders_enabled,
  exam_reminders_enabled,
  study_session_reminders_enabled,
  reminder_lead_minutes,
  time_zone
)
values (true, true, true, 60, 'America/New_York');

-- Create an assignment due in 30 minutes.
insert into public.assignments (
  title, kind, due_on, due_time
)
values (
  'Reminder Test Assignment',
  'assignment',
  ((now() + interval '30 minutes') at time zone 'America/New_York')::date,
  ((now() + interval '30 minutes') at time zone 'America/New_York')::time
);

-- Create an exam due in 30 minutes.
insert into public.assignments (
  title, kind, due_on, due_time
)
values (
  'Reminder Test Exam',
  'exam',
  ((now() + interval '30 minutes') at time zone 'America/New_York')::date,
  ((now() + interval '30 minutes') at time zone 'America/New_York')::time
);

-- Create a completed assignment, which should not generate a reminder.
insert into public.assignments (
  title, kind, due_on, due_time
)
values (
  'Completed Test Assignment',
  'assignment',
  ((now() + interval '30 minutes') at time zone 'America/New_York')::date,
  ((now() + interval '30 minutes') at time zone 'America/New_York')::time
);

update public.assignments
set completed_at = now()
where title = 'Completed Test Assignment';

-- Create three study sessions with the same future start time.
insert into public.study_sessions (
  starts_on, start_time, duration_minutes
)
values
  (
    ((now() + interval '30 minutes') at time zone 'America/New_York')::date,
    ((now() + interval '30 minutes') at time zone 'America/New_York')::time,
    60
  ),
  (
    ((now() + interval '30 minutes') at time zone 'America/New_York')::date,
    ((now() + interval '30 minutes') at time zone 'America/New_York')::time,
    60
  ),
  (
    ((now() + interval '30 minutes') at time zone 'America/New_York')::date,
    ((now() + interval '30 minutes') at time zone 'America/New_York')::time,
    60
  );

-- Mark one session completed and another canceled.
update public.study_sessions
set completed_at = now()
where id = (
  select id from public.study_sessions
  order by created_at, id
  offset 1 limit 1
);

update public.study_sessions
set canceled_at = now()
where id = (
  select id from public.study_sessions
  order by created_at, id
  offset 2 limit 1
);

-- The reminder generator is restricted to the database owner.
reset role;

select lives_ok(
  $$ select public.generate_reminders() $$,
  'the database generates upcoming reminders'
);

select is(
  (select count(*)::int from public.notifications),
  3,
  'one notification is generated for each eligible event'
);

select is(
  (select count(*)::int from public.notifications
   where source_type = 'assignment'),
  1,
  'the eligible assignment receives a reminder'
);

select is(
  (select count(*)::int from public.notifications
   where source_type = 'exam'),
  1,
  'the eligible exam receives a reminder'
);

select is(
  (select count(*)::int from public.notifications
   where source_type = 'study_session'),
  1,
  'the eligible study session receives a reminder'
);

select is(
  (
    select count(*)::int
    from public.notifications n
    join public.assignments a on a.id = n.source_id
    where a.completed_at is not null
  ),
  0,
  'completed assignments do not receive reminders'
);

select is(
  (
    select count(*)::int
    from public.notifications n
    join public.study_sessions ss on ss.id = n.source_id
    where ss.completed_at is not null or ss.canceled_at is not null
  ),
  0,
  'completed and canceled sessions do not receive reminders'
);

select is(
  (
    select count(*)::int
    from public.notifications n
    join public.assignments a on a.id = n.source_id
    where n.source_type = 'assignment'
      and n.scheduled_for =
        ((a.due_on + a.due_time) at time zone 'America/New_York')
        - interval '60 minutes'
  ),
  1,
  'assignment reminders use the configured lead time and time zone'
);

-- Running the generator again must not create duplicate notifications.
select public.generate_reminders();

select is(
  (select count(*)::int from public.notifications),
  3,
  'running the generator twice does not create duplicates'
);

-- Return to the authenticated role to test notification visibility.
set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}',
  true
);

select is(
  (select count(*)::int from public.notifications),
  3,
  'students can see their own notifications'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}',
  true
);

select is_empty(
  $$ select * from public.notifications $$,
  'students cannot see another student''s notifications'
);

-- Verify that disabled reminder preferences are respected.
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}',
  true
);

update public.student_settings
set exam_reminders_enabled = false;

insert into public.assignments (
  title, kind, due_on, due_time
)
values (
  'Disabled Exam Reminder Test',
  'exam',
  ((now() + interval '30 minutes') at time zone 'America/New_York')::date,
  ((now() + interval '30 minutes') at time zone 'America/New_York')::time
);

reset role;

select public.generate_reminders();

select is(
  (select count(*)::int from public.notifications),
  3,
  'disabled exam reminders are not generated'
);

set local role authenticated;

select * from finish();
rollback;
