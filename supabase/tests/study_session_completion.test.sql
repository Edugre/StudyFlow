-- SP-09: study session completion.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select throws_ok(
  $$ insert into public.study_sessions (starts_on, start_time, duration_minutes, completed_at)
     values ('2026-11-12', '18:00', 60, now()) $$,
  '42501', null, 'sessions cannot be created as completed'
);
insert into public.study_sessions (starts_on, start_time, duration_minutes)
  values ('2026-11-12', '18:00', 60);
select is((select completed_at from public.study_sessions), null, 'new sessions are unfinished');

update public.study_sessions set completed_at = '2000-01-01';
select ok(
  (select completed_at > '2020-01-01' from public.study_sessions),
  'the database records its own completion time'
);
select set_config('test.first_completion', (select completed_at::text from public.study_sessions), true);

update public.study_sessions set completed_at = now() + interval '1 day';
select is(
  (select completed_at from public.study_sessions),
  current_setting('test.first_completion')::timestamptz,
  'completing again keeps the first completion'
);
update public.study_sessions set completed_at = null;
select is(
  (select completed_at from public.study_sessions),
  current_setting('test.first_completion')::timestamptz,
  'completion cannot be undone'
);
update public.study_sessions set objective = 'Review';
select is(
  (select completed_at from public.study_sessions),
  current_setting('test.first_completion')::timestamptz,
  'other edits keep the completion'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select is_empty(
  $$ update public.study_sessions set completed_at = now() returning id $$,
  'other students cannot complete the session'
);

select * from finish();
rollback;
