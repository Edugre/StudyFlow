-- SP-03: study sessions linked to tasks.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');
insert into public.courses (id, owner_id, name) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000a', 'Math'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-00000000000a', 'Physics');
insert into public.assignments (id, owner_id, course_id, title) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a',
   '00000000-0000-0000-0000-0000000000c1', 'Midterm'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000000a',
   null, 'Reading'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b',
   null, 'Their task');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select lives_ok(
  $$ insert into public.study_sessions (id, course_id, assignment_id, starts_on, start_time, duration_minutes)
     values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c1',
             '00000000-0000-0000-0000-0000000000a1', '2026-11-12', '18:00', 60) $$,
  'a session links to a task in the same course'
);
select lives_ok(
  $$ insert into public.study_sessions (id, assignment_id, starts_on, start_time, duration_minutes)
     values ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000a1',
             '2026-11-13', '18:00', 60) $$,
  'a session without a course can link to a task'
);
select throws_ok(
  $$ insert into public.study_sessions (course_id, assignment_id, starts_on, start_time, duration_minutes)
     values ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a1',
             '2026-11-12', '18:00', 60) $$,
  'P0001', null, 'a session cannot link to a task in another course'
);
select throws_ok(
  $$ update public.study_sessions set course_id = '00000000-0000-0000-0000-0000000000c2'
     where id = '00000000-0000-0000-0000-0000000000e1' $$,
  'P0001', null, 'a linked session cannot move to a course its task is not in'
);
select throws_ok(
  $$ update public.study_sessions set assignment_id = '00000000-0000-0000-0000-0000000000b1'
     where id = '00000000-0000-0000-0000-0000000000e1' $$,
  'P0002', null, 'a session cannot link to another student''s task'
);
select lives_ok(
  $$ update public.study_sessions set assignment_id = '00000000-0000-0000-0000-0000000000a2'
     where id = '00000000-0000-0000-0000-0000000000e1' $$,
  'a session in a course can link to a task without a course'
);
update public.study_sessions set assignment_id = '00000000-0000-0000-0000-0000000000a1'
  where id = '00000000-0000-0000-0000-0000000000e1';

update public.assignments set course_id = '00000000-0000-0000-0000-0000000000c2'
  where id = '00000000-0000-0000-0000-0000000000a1';
select results_eq(
  $$ select course_id from public.study_sessions order by starts_on $$,
  $$ values ('00000000-0000-0000-0000-0000000000c2'::uuid),
            ('00000000-0000-0000-0000-0000000000c2'::uuid) $$,
  'moving a task moves its linked sessions to the new course'
);
update public.assignments set title = 'Midterm exam'
  where id = '00000000-0000-0000-0000-0000000000a1';
select is(
  (select count(*)::int from public.study_sessions
   where course_id = '00000000-0000-0000-0000-0000000000c2'),
  2, 'other task edits leave linked sessions alone'
);
update public.assignments set course_id = null
  where id = '00000000-0000-0000-0000-0000000000a1';
select is(
  (select count(*)::int from public.study_sessions where course_id is null),
  2, 'unlinking a task from its course unlinks its sessions too'
);

delete from public.assignments where id = '00000000-0000-0000-0000-0000000000a1';
select is(
  (select count(*)::int from public.study_sessions), 2,
  'deleting a task keeps its sessions'
);
select is(
  (select count(*)::int from public.study_sessions where assignment_id is not null), 0,
  'deleting a task unlinks its sessions'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select is_empty(
  $$ update public.study_sessions set assignment_id = '00000000-0000-0000-0000-0000000000b1' returning id $$,
  'other students cannot link the session to a task'
);
select is_empty(
  $$ select assignment_id from public.study_sessions $$,
  'other students cannot read the link'
);

select * from finish();
rollback;
