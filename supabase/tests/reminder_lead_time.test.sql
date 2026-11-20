-- RN-04: students choose how far in advance reminders arrive.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

-- Every event is 90 minutes away: a 120-minute lead reminds now, a 60-minute
-- lead does not yet. Times are UTC wall time.
select set_config('test.due_on', (((now() + interval '90 minutes') at time zone 'UTC')::date)::text, true);
select set_config('test.due_time', (((now() + interval '90 minutes') at time zone 'UTC')::time(0))::text, true);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

-- A supported lead time is saved and persists.
select lives_ok(
  $$ insert into public.student_settings (reminder_lead_minutes, time_zone) values (120, 'UTC') $$,
  'a student saves a lead time'
);
select is(
  (select reminder_lead_minutes from public.student_settings), 120,
  'the saved lead time persists'
);
select lives_ok(
  $$ update public.student_settings set reminder_lead_minutes = 5 $$,
  'five minutes is supported'
);
select lives_ok(
  $$ update public.student_settings set reminder_lead_minutes = 10080 $$,
  'seven days is supported'
);
update public.student_settings set reminder_lead_minutes = 120;

-- Unsupported lead times are rejected and the saved one remains.
select throws_ok(
  $$ update public.student_settings set reminder_lead_minutes = 4 $$,
  '23514', null, 'less than five minutes is rejected'
);
select throws_ok(
  $$ update public.student_settings set reminder_lead_minutes = 10081 $$,
  '23514', null, 'more than seven days is rejected'
);
select throws_ok(
  $$ update public.student_settings set reminder_lead_minutes = null $$,
  '23502', null, 'a missing lead time is rejected'
);
select is(
  (select reminder_lead_minutes from public.student_settings), 120,
  'the previous lead time remains after a rejected change'
);

insert into public.assignments (title, kind, due_on, due_time) values
  ('Lab report', 'assignment', current_setting('test.due_on')::date, current_setting('test.due_time')::time),
  ('Final exam', 'exam', current_setting('test.due_on')::date, current_setting('test.due_time')::time);
insert into public.study_sessions (starts_on, start_time, duration_minutes) values
  (current_setting('test.due_on')::date, current_setting('test.due_time')::time, 60);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
insert into public.student_settings (reminder_lead_minutes, time_zone) values (60, 'UTC');
insert into public.assignments (title, due_on, due_time) values
  ('Lab report', current_setting('test.due_on')::date, current_setting('test.due_time')::time);

reset role;
select public.generate_reminders();

-- Reminders are scheduled relative to each event's deadline or start time.
select is(
  (select count(*)::int from public.notifications
   where owner_id = '00000000-0000-0000-0000-00000000000a'),
  3,
  'with a 120-minute lead, events 90 minutes away are reminded'
);
select is(
  (select count(*)::int from public.notifications
   where owner_id = '00000000-0000-0000-0000-00000000000a'
     and scheduled_for = (
       (current_setting('test.due_on')::date + current_setting('test.due_time')::time)
         at time zone 'UTC'
     ) - interval '120 minutes'),
  3,
  'assignment, exam and study-session reminders are all scheduled by the lead time'
);
select is(
  (select count(*)::int from public.notifications
   where owner_id = '00000000-0000-0000-0000-00000000000b'),
  0,
  'with a 60-minute lead, the same deadline is not reminded yet'
);

-- A changed lead time applies to the next reminder check.
update public.student_settings set reminder_lead_minutes = 120
where owner_id = '00000000-0000-0000-0000-00000000000b';
select public.generate_reminders();
select is(
  (select count(*)::int from public.notifications
   where owner_id = '00000000-0000-0000-0000-00000000000b'),
  1,
  'a longer lead time reminds at the next check'
);

select * from finish();
rollback;
