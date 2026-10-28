-- Database-level guarantees for student settings: normalization, RLS, privileges.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select lives_ok(
  $$ insert into public.student_settings (current_semester) values ('  Fall 2026  ') $$,
  'student saves a current semester'
);
select results_eq(
  $$ select owner_id, current_semester from public.student_settings $$,
  $$ values ('00000000-0000-0000-0000-00000000000a'::uuid, 'Fall 2026'::text) $$,
  'owner comes from the session and labels are trimmed'
);
select lives_ok(
  $$ update public.student_settings set current_semester = '   ' $$,
  'student clears the current semester'
);
select is(
  (select current_semester from public.student_settings), null,
  'blank semesters are stored as null'
);
select throws_ok(
  $$ update public.student_settings set owner_id = '00000000-0000-0000-0000-00000000000b' $$,
  '42501', null, 'owner_id cannot be changed'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select is_empty($$ select * from public.student_settings $$, 'other students see no settings');
select is_empty(
  $$ update public.student_settings set current_semester = 'Hacked' returning owner_id $$,
  'other students cannot update settings'
);

select * from finish();
rollback;
