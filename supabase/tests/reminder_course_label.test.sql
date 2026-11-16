-- RN-10: reminders identify the related course and task.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

-- Everything is due in 30 minutes, inside the default 60-minute lead, so one
-- reminder check creates every reminder. Without saved settings times are UTC.
select set_config('test.due_on', (((now() + interval '30 minutes') at time zone 'UTC')::date)::text, true);
select set_config('test.due_time', (((now() + interval '30 minutes') at time zone 'UTC')::time(0))::text, true);
select set_config('test.due_text', to_char(
  current_setting('test.due_on')::date + current_setting('test.due_time')::time,
  'Mon DD, YYYY HH12:MI AM'
), true);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

insert into public.courses (name, code) values
  ('Software Engineering', 'CEN4010'),
  ('Databases', null);
insert into public.assignments (title, kind, course_id, due_on, due_time)
select task.title, task.kind,
  (select id from public.courses where name = task.course),
  current_setting('test.due_on')::date, current_setting('test.due_time')::time
from (values
  ('Final report', 'assignment', 'Software Engineering'),
  ('Final report', 'assignment', 'Databases'),
  ('Midterm', 'exam', 'Software Engineering'),
  ('Reading', 'assignment', null)
) as task (title, kind, course);
-- No deadline, so the reminder check never creates a reminder for it.
insert into public.assignments (title, course_id)
select 'Undated', id from public.courses where name = 'Software Engineering';
insert into public.study_sessions (course_id, starts_on, start_time, duration_minutes)
select course_id, current_setting('test.due_on')::date, current_setting('test.due_time')::time, 60
from (
  select id as course_id from public.courses where name = 'Databases'
  union all select null
) as session;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
insert into public.courses (name) values ('Algorithms');
insert into public.assignments (title, course_id, due_on, due_time)
select 'Final report', id, current_setting('test.due_on')::date, current_setting('test.due_time')::time
from public.courses;

reset role;
select lives_ok(
  $$ select public.generate_reminders() $$,
  'reminders are generated with course labels'
);
select is(
  (select count(*)::int from public.notifications),
  7,
  'labelling does not change which reminders are created'
);

-- A reminder for a course-linked task shows its title, course and deadline.
select is(
  (select n.message from public.notifications n
   join public.assignments a on a.id = n.source_id
   join public.courses c on c.id = a.course_id
   where a.title = 'Final report' and c.name = 'Software Engineering'),
  format('Software Engineering: Final report is due %s.', current_setting('test.due_text')),
  'an assignment reminder names the task, its course and the deadline'
);
select is(
  (select n.message from public.notifications n
   join public.assignments a on a.id = n.source_id
   where a.title = 'Midterm'),
  format('Software Engineering: Midterm is scheduled for %s.', current_setting('test.due_text')),
  'an exam reminder names the task, its course and the deadline'
);
select is(
  (select n.message from public.notifications n
   join public.study_sessions s on s.id = n.source_id
   where s.course_id is not null),
  format('Databases: Your study session is scheduled for %s.', current_setting('test.due_text')),
  'a study-session reminder names its course'
);

-- Tasks that share a title are told apart by their course.
select is(
  (select n.message from public.notifications n
   join public.assignments a on a.id = n.source_id
   join public.courses c on c.id = a.course_id
   where a.title = 'Final report' and c.name = 'Databases'),
  format('Databases: Final report is due %s.', current_setting('test.due_text')),
  'the same title in another course carries that course''s label'
);
select is(
  (select count(distinct n.message)::int from public.notifications n
   join public.assignments a on a.id = n.source_id
   where a.title = 'Final report'),
  3,
  'reminders for tasks that share a title all read differently'
);

-- Work without a course keeps the reminder as it was written.
select is(
  (select n.message from public.notifications n
   join public.assignments a on a.id = n.source_id
   where a.title = 'Reading'),
  format('Reading is due %s.', current_setting('test.due_text')),
  'a task without a course has no label'
);
select is(
  (select n.message from public.notifications n
   join public.study_sessions s on s.id = n.source_id
   where s.course_id is null),
  format('Your study session is scheduled for %s.', current_setting('test.due_text')),
  'a study session without a course has no label'
);
select is(
  (select count(*)::int from public.notifications
   where title not in ('Assignment reminder', 'Exam reminder', 'Study session reminder')),
  0,
  'reminder titles are unchanged'
);

-- Labels never cross accounts.
select is(
  (select message from public.notifications
   where owner_id = '00000000-0000-0000-0000-00000000000b'),
  format('Algorithms: Final report is due %s.', current_setting('test.due_text')),
  'another student''s reminder carries their own course'
);
insert into public.notifications (owner_id, source_type, source_id, scheduled_for, title, message)
select '00000000-0000-0000-0000-00000000000b', 'assignment', id, now(), 'Assignment reminder', 'Not mine'
from public.assignments where title = 'Midterm';
select is(
  (select message from public.notifications where title = 'Assignment reminder' and message like '%Not mine'),
  'Not mine',
  'a reminder is never labelled with another student''s course'
);

-- A label that would push the message past its limit is left off.
select lives_ok(
  $$ insert into public.notifications (owner_id, source_type, source_id, scheduled_for, title, message)
     select owner_id, 'assignment', id, now(), 'Assignment reminder', repeat('x', 495)
     from public.assignments where title = 'Undated' $$,
  'a message with no room for a label is still saved'
);

-- Later reminder checks do not label a reminder twice.
select public.generate_reminders();
select is(
  (select count(*)::int from public.notifications where message like '%: %: %'),
  0,
  'running the generator again does not repeat the label'
);

select * from finish();
rollback;
