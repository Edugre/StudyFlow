-- RN-09: completed tasks stop generating deadline reminders.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

-- Every task is due in three hours. With a 60-minute lead the reminder time
-- is still two hours away; raising the lead to 240 minutes makes it pass.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

insert into public.student_settings (reminder_lead_minutes, time_zone) values (60, 'UTC');
insert into public.assignments (title, kind, due_on, due_time)
select title, kind,
  ((now() + interval '3 hours') at time zone 'UTC')::date,
  ((now() + interval '3 hours') at time zone 'UTC')::time
from (values
  ('Finished early', 'assignment'),
  ('Finished exam', 'exam'),
  ('Finished after reminder', 'assignment'),
  ('Read then finished', 'assignment'),
  ('Still open', 'assignment')
) as task (title, kind);
insert into public.study_sessions (starts_on, start_time, duration_minutes) values (
  ((now() + interval '3 hours') at time zone 'UTC')::date,
  ((now() + interval '3 hours') at time zone 'UTC')::time,
  60
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
insert into public.student_settings (reminder_lead_minutes, time_zone) values (240, 'UTC');
insert into public.assignments (title, due_on, due_time) values (
  'Another student''s task',
  ((now() + interval '3 hours') at time zone 'UTC')::date,
  ((now() + interval '3 hours') at time zone 'UTC')::time
);

reset role;
select public.generate_reminders();
select is(
  (select count(*)::int from public.notifications
   where owner_id = '00000000-0000-0000-0000-00000000000a'),
  0,
  'reminders stay pending until the reminder time'
);

-- Completed before the reminder time: the pending reminder is suppressed.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
update public.assignments set completed_at = now()
where title in ('Finished early', 'Finished exam');
update public.student_settings set reminder_lead_minutes = 240;

reset role;
select public.generate_reminders();
select is(
  (select count(*)::int from public.notifications n
   join public.assignments a on a.id = n.source_id
   where a.title in ('Finished after reminder', 'Read then finished', 'Still open')),
  3,
  'open tasks are reminded once the reminder time arrives'
);
select is(
  (select count(*)::int from public.notifications n
   join public.assignments a on a.id = n.source_id
   where a.title = 'Finished early'),
  0,
  'a task completed before its reminder time is not reminded'
);
select is(
  (select count(*)::int from public.notifications n
   join public.assignments a on a.id = n.source_id
   where a.title = 'Finished exam'),
  0,
  'an exam completed before its reminder time is not reminded'
);

-- Completed after the reminder was delivered: unread reminders are canceled.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
update public.notifications set read_at = now()
where source_id = (select id from public.assignments where title = 'Read then finished');

update public.assignments set title = 'Still open, renamed' where title = 'Still open';
select is(
  (select count(*)::int from public.notifications where source_type = 'assignment'),
  3,
  'editing an open task keeps its reminder'
);

select throws_ok(
  $$ delete from public.notifications $$,
  '42501', null, 'students cannot delete reminders themselves'
);
select throws_ok(
  $$ select public.cancel_completed_assignment_reminders() $$,
  '42501', null, 'the cancellation only runs when a task is completed'
);

update public.assignments set completed_at = now()
where title in ('Finished after reminder', 'Read then finished');
select is(
  (select count(*)::int from public.notifications n
   join public.assignments a on a.id = n.source_id
   where a.title = 'Finished after reminder'),
  0,
  'completing a task cancels its unread reminder'
);
select is(
  (select count(*)::int from public.notifications n
   join public.assignments a on a.id = n.source_id
   where a.title = 'Read then finished' and n.read_at is not null),
  1,
  'a reminder the student already read stays in their history'
);
select is(
  (select count(*)::int from public.notifications n
   join public.assignments a on a.id = n.source_id
   where a.title = 'Still open, renamed'),
  1,
  'reminders for other open tasks are kept'
);
select is(
  (select count(*)::int from public.notifications where source_type = 'study_session'),
  1,
  'study-session reminders are kept'
);

reset role;
select is(
  (select count(*)::int from public.notifications
   where owner_id = '00000000-0000-0000-0000-00000000000b'),
  1,
  'another student''s reminders are kept'
);

-- Later reminder checks create nothing for tasks that stay completed.
select set_config('test.reminders_before', (select count(*)::text from public.notifications), true);
select public.generate_reminders();
select public.generate_reminders();
select is(
  (select count(*)::int from public.notifications n
   join public.assignments a on a.id = n.source_id
   where a.title in ('Finished early', 'Finished exam', 'Finished after reminder')),
  0,
  'later checks create no reminders for completed tasks'
);
select is(
  (select count(*)::int from public.notifications),
  current_setting('test.reminders_before')::int,
  'later checks leave the remaining reminders unchanged'
);

select * from finish();
rollback;
