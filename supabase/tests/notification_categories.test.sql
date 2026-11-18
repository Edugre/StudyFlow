-- RN-07: students turn categories of notifications on or off.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

-- "Soon" events fall inside the 60-minute lead; "past" deadlines have just
-- been missed. Times are UTC wall time.
select set_config('test.soon_on', (((now() + interval '30 minutes') at time zone 'UTC')::date)::text, true);
select set_config('test.soon_time', (((now() + interval '30 minutes') at time zone 'UTC')::time(0))::text, true);
select set_config('test.past_on', (((now() - interval '2 hours') at time zone 'UTC')::date)::text, true);
select set_config('test.past_time', (((now() - interval '2 hours') at time zone 'UTC')::time(0))::text, true);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

-- Assignment reminders and overdue notices start off; exams and study
-- sessions stay on.
insert into public.student_settings (
  assignment_reminders_enabled, exam_reminders_enabled,
  study_session_reminders_enabled, overdue_notifications_enabled,
  reminder_lead_minutes, time_zone
) values (false, true, true, false, 60, 'UTC');

insert into public.assignments (title, kind, due_on, due_time) values
  ('Essay', 'assignment', current_setting('test.soon_on')::date, current_setting('test.soon_time')::time),
  ('Midterm', 'exam', current_setting('test.soon_on')::date, current_setting('test.soon_time')::time),
  ('Late lab', 'assignment', current_setting('test.past_on')::date, current_setting('test.past_time')::time);
-- RN-06: these tasks have their own reminders off.
insert into public.assignments (title, kind, due_on, due_time, reminders_enabled) values
  ('Muted essay', 'assignment', current_setting('test.soon_on')::date, current_setting('test.soon_time')::time, false),
  ('Muted late lab', 'assignment', current_setting('test.past_on')::date, current_setting('test.past_time')::time, false);
insert into public.study_sessions (starts_on, start_time, duration_minutes) values
  (current_setting('test.soon_on')::date, current_setting('test.soon_time')::time, 60);

-- The second student keeps every category on.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
insert into public.assignments (title, due_on, due_time) values
  ('Other student''s late task', current_setting('test.past_on')::date, current_setting('test.past_time')::time);

reset role;
select public.generate_reminders();

select is(
  (select count(*)::int from public.notifications
   where owner_id = '00000000-0000-0000-0000-00000000000a' and source_type = 'assignment'),
  0,
  'with assignment reminders off, no assignment reminders are created'
);
select is(
  (select count(*)::int from public.notifications
   where owner_id = '00000000-0000-0000-0000-00000000000a' and source_type = 'overdue'),
  0,
  'with overdue notifications off, no overdue notices are created'
);
select is(
  (select count(*)::int from public.notifications
   where owner_id = '00000000-0000-0000-0000-00000000000a' and source_type = 'exam'),
  1,
  'categories left on keep working: exams'
);
select is(
  (select count(*)::int from public.notifications
   where owner_id = '00000000-0000-0000-0000-00000000000a' and source_type = 'study_session'),
  1,
  'categories left on keep working: study sessions'
);
select is(
  (select count(*)::int from public.notifications
   where owner_id = '00000000-0000-0000-0000-00000000000b'),
  1,
  'another student''s categories are their own'
);

-- Turn assignments and overdue back on; turn exams and study sessions off,
-- then schedule a new exam and session.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
update public.student_settings set
  assignment_reminders_enabled = true,
  overdue_notifications_enabled = true,
  exam_reminders_enabled = false,
  study_session_reminders_enabled = false;
insert into public.assignments (title, kind, due_on, due_time) values
  ('Final exam', 'exam', current_setting('test.soon_on')::date, current_setting('test.soon_time')::time);
insert into public.study_sessions (starts_on, start_time, duration_minutes) values
  (current_setting('test.soon_on')::date, current_setting('test.soon_time')::time, 90);

reset role;
select public.generate_reminders();

select is(
  (select count(*)::int from public.notifications n
   join public.assignments a on a.id = n.source_id
   where a.title = 'Essay'),
  1,
  'turning assignment reminders back on resumes them'
);
select is(
  (select count(*)::int from public.notifications n
   join public.assignments a on a.id = n.source_id
   where a.title = 'Late lab' and n.source_type = 'overdue'),
  1,
  'turning overdue notifications back on resumes them'
);
select is(
  (select count(*)::int from public.notifications n
   join public.assignments a on a.id = n.source_id
   where a.title in ('Muted essay', 'Muted late lab')),
  0,
  'a re-enabled category still respects each task''s own reminder setting'
);
select is(
  (select count(*)::int from public.notifications n
   join public.assignments a on a.id = n.source_id
   where a.title = 'Final exam'),
  0,
  'turning exam reminders off stops new exam reminders'
);
select is(
  (select count(*)::int from public.notifications
   where owner_id = '00000000-0000-0000-0000-00000000000a' and source_type = 'study_session'),
  1,
  'turning study-session reminders off stops new study-session reminders'
);

select * from finish();
rollback;
