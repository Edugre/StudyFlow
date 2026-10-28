-- Database-level guarantees for courses: constraints, RLS isolation, privileges.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select lives_ok(
  $$ select public.create_course('  Math  ', 'MAC 2311', null, '  ', '[{"day":"mon","startTime":"09:00","endTime":"10:15"}]') $$,
  'student creates a course with meetings'
);
select results_eq(
  $$ select name, semester from public.courses $$,
  $$ values ('Math'::text, null::text) $$,
  'names are trimmed and blank semesters stored as null'
);
select throws_ok($$ select public.create_course('   ') $$, '23514', null, 'blank names are rejected');
select throws_ok(
  $$ select public.create_course('M', null, null, null, '[{"day":"mon","startTime":"10:00","endTime":"09:00"}]') $$,
  '23514', null, 'meetings must end after they start'
);
select throws_ok(
  $$ select public.create_course('M', null, null, null, '[{"day":"mon","startTime":"24:00","endTime":"25:00"}]') $$,
  '22023', null, 'meeting times must be HH:MM'
);
select is((select count(*)::int from public.courses), 1, 'failed creates leave nothing behind');
select throws_ok(
  $$ update public.courses set owner_id = '00000000-0000-0000-0000-00000000000b' $$,
  '42501', null, 'owner_id cannot be changed'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select is_empty($$ select * from public.courses $$, 'other students see no courses');
select is_empty($$ select * from public.course_meetings $$, 'other students see no meetings');
select is_empty($$ update public.courses set name = 'Hacked' returning id $$, 'other students cannot update');
select is_empty($$ delete from public.courses returning id $$, 'other students cannot delete');
select throws_ok(
  $$ select public.replace_course_meetings((select id from public.courses limit 1), '[]') $$,
  'P0002', null, 'other students cannot replace meetings'
);

reset role;
set local role anon;
select throws_ok($$ select * from public.courses $$, '42501', null, 'anonymous users have no access');

reset role;
delete from public.courses;
select is((select count(*)::int from public.course_meetings), 0, 'meetings cascade with their course');

select * from finish();
rollback;
