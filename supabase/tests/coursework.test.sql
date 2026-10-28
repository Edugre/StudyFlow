-- Database-level guarantees for course-linked assignments and study sessions.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');
insert into public.courses (id, owner_id, name) values
  ('00000000-0000-0000-0000-0000000000ca', '00000000-0000-0000-0000-00000000000a', 'A course'),
  ('00000000-0000-0000-0000-0000000000cb', '00000000-0000-0000-0000-00000000000b', 'B course');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select lives_ok(
  $$ insert into public.assignments (course_id, title)
     values ('00000000-0000-0000-0000-0000000000ca', '  Essay  ') $$,
  'student links an assignment to their own course'
);
select is((select title from public.assignments), 'Essay', 'titles are trimmed');
select lives_ok(
  $$ insert into public.study_sessions (course_id, starts_on, start_time, duration_minutes)
     values ('00000000-0000-0000-0000-0000000000ca', '2026-11-02', '18:00', 90) $$,
  'student links a study session to their own course'
);
select throws_ok(
  $$ insert into public.assignments (course_id, title)
     values ('00000000-0000-0000-0000-0000000000cb', 'Sneaky') $$,
  '42501', null, 'assignments cannot link to another student''s course'
);
select throws_ok(
  $$ update public.study_sessions set course_id = '00000000-0000-0000-0000-0000000000cb' $$,
  '42501', null, 'sessions cannot be relinked to another student''s course'
);
select throws_ok(
  $$ insert into public.assignments (title) values ('   ') $$,
  '23514', null, 'blank titles are rejected'
);
select throws_ok(
  $$ insert into public.study_sessions (starts_on, start_time, duration_minutes)
     values ('2026-11-02', '18:00', 0) $$,
  '23514', null, 'durations must be positive'
);
select throws_ok(
  $$ update public.assignments set owner_id = '00000000-0000-0000-0000-00000000000b' $$,
  '42501', null, 'owner_id cannot be changed'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select is_empty($$ select * from public.assignments $$, 'other students see no assignments');
select is_empty($$ select * from public.study_sessions $$, 'other students see no sessions');
select is_empty(
  $$ update public.assignments set course_id = null returning id $$,
  'other students cannot relink assignments'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
delete from public.courses where id = '00000000-0000-0000-0000-0000000000ca';
select results_eq(
  $$ select title, course_id from public.assignments $$,
  $$ values ('Essay'::text, null::uuid) $$,
  'deleting a course keeps its assignments, unlinked'
);
select results_eq(
  $$ select duration_minutes, course_id from public.study_sessions $$,
  $$ values (90, null::uuid) $$,
  'deleting a course keeps its study sessions, unlinked'
);

select * from finish();
rollback;
