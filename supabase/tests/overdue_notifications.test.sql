-- RN-05: a notification when a task becomes overdue.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

-- Deadlines relative to now, as UTC wall time (students without saved
-- settings use UTC).
select set_config('test.past_on', (((now() - interval '2 hours') at time zone 'UTC')::date)::text, true);
select set_config('test.past_time', (((now() - interval '2 hours') at time zone 'UTC')::time(0))::text, true);
select set_config('test.past_text', to_char(
  current_setting('test.past_on')::date + current_setting('test.past_time')::time,
  'Mon DD, YYYY HH12:MI AM'
), true);
select set_config('test.old_on', (((now() - interval '3 days') at time zone 'UTC')::date)::text, true);
select set_config('test.soon_on', (((now() + interval '30 minutes') at time zone 'UTC')::date)::text, true);
select set_config('test.soon_time', (((now() + interval '30 minutes') at time zone 'UTC')::time(0))::text, true);
select set_config('test.later_on', (((now() + interval '3 hours') at time zone 'UTC')::date)::text, true);
select set_config('test.later_time', (((now() + interval '3 hours') at time zone 'UTC')::time(0))::text, true);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

insert into public.courses (name) values ('Software Engineering');
insert into public.assignments (title, kind, due_on, due_time) values
  ('Late essay', 'assignment', current_setting('test.past_on')::date, current_setting('test.past_time')::time),
  ('Long overdue', 'assignment', current_setting('test.old_on')::date, null),
  ('Due soon', 'assignment', current_setting('test.soon_on')::date, current_setting('test.soon_time')::time),
  ('Not due yet', 'assignment', current_setting('test.later_on')::date, current_setting('test.later_time')::time),
  ('Finished before deadline', 'assignment', current_setting('test.later_on')::date, current_setting('test.later_time')::time);
-- Any task type can become overdue; this one also belongs to a course.
insert into public.assignments (title, kind, course_id, due_on, due_time)
select 'Late quiz', 'quiz', id, current_setting('test.past_on')::date, current_setting('test.past_time')::time
from public.courses;
insert into public.assignments (title) values ('Undated');

-- Completed while its deadline was still ahead; moving the deadline into the
-- past then stands in for time passing.
update public.assignments set completed_at = now() where title = 'Finished before deadline';
update public.assignments
set due_on = current_setting('test.past_on')::date, due_time = current_setting('test.past_time')::time
where title = 'Finished before deadline';

-- The second student turned overdue notifications off.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
insert into public.student_settings (overdue_notifications_enabled) values (false);
insert into public.assignments (title, due_on, due_time) values
  ('Muted late task', current_setting('test.past_on')::date, current_setting('test.past_time')::time);

reset role;
select lives_ok(
  $$ select public.generate_reminders() $$,
  'the reminder check creates overdue notices'
);
select is(
  (select count(*)::int from public.notifications
   where source_type = 'overdue' and owner_id = '00000000-0000-0000-0000-00000000000a'),
  2,
  'each open task whose deadline passed gets one overdue notice'
);
select results_eq(
  $$ select n.title, n.message from public.notifications n
     join public.assignments a on a.id = n.source_id
     where a.title = 'Late essay' $$,
  $$ values ('Task overdue'::text, format('Late essay was due %s.', current_setting('test.past_text'))) $$,
  'the notice names the task and the deadline it missed'
);
select is(
  (select n.message from public.notifications n
   join public.assignments a on a.id = n.source_id
   where a.title = 'Late quiz'),
  format('Software Engineering: Late quiz was due %s.', current_setting('test.past_text')),
  'any task type can be overdue, and the notice names its course'
);
select is(
  (select count(*)::int from public.notifications n
   join public.assignments a on a.id = n.source_id
   where a.title = 'Finished before deadline'),
  0,
  'a task completed before its deadline gets no overdue notice'
);
select is(
  (select count(*)::int from public.notifications n
   join public.assignments a on a.id = n.source_id
   where a.title = 'Long overdue'),
  0,
  'deadlines missed more than a day ago are not reported'
);
select is(
  (select count(*)::int from public.notifications n
   join public.assignments a on a.id = n.source_id
   where a.title in ('Not due yet', 'Undated')),
  0,
  'tasks that are not due yet, or have no deadline, get no notice'
);
select is(
  (select count(*)::int from public.notifications
   where owner_id = '00000000-0000-0000-0000-00000000000b'),
  0,
  'students who turned overdue notifications off get none'
);

-- "Due soon" was reminded in the first check. Once its deadline passes it
-- also gets an overdue notice.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
update public.assignments
set due_on = current_setting('test.past_on')::date, due_time = current_setting('test.past_time')::time
where title = 'Due soon';

reset role;
select public.generate_reminders();
select results_eq(
  $$ select n.source_type from public.notifications n
     join public.assignments a on a.id = n.source_id
     where a.title = 'Due soon' order by n.source_type $$,
  $$ values ('assignment'::text), ('overdue'::text) $$,
  'a task that was reminded still gets its overdue notice'
);
select public.generate_reminders();
select is(
  (select count(*)::int from public.notifications
   where source_type = 'overdue' and owner_id = '00000000-0000-0000-0000-00000000000a'),
  3,
  'later checks do not repeat an overdue notice'
);

-- RN-09: completing an overdue task withdraws its unread notice.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
update public.assignments set completed_at = now() where title = 'Late essay';
select is(
  (select count(*)::int from public.notifications n
   join public.assignments a on a.id = n.source_id
   where a.title = 'Late essay'),
  0,
  'completing an overdue task withdraws its unread notice'
);
select is(
  (select count(*)::int from public.notifications where source_type = 'overdue'),
  2,
  'students see their own remaining overdue notices'
);

select * from finish();
rollback;
