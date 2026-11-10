-- SP-06: study session objectives.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

insert into public.study_sessions (starts_on, start_time, duration_minutes, objective)
  values ('2026-11-12', '18:00', 60, '  Review chapter 3  ');
select is((select objective from public.study_sessions), 'Review chapter 3', 'objectives are trimmed');

update public.study_sessions set objective = 'Finish problem set 4';
select is(
  (select objective || ' @ ' || starts_on || ' ' || start_time || ' ' || duration_minutes
   from public.study_sessions),
  'Finish problem set 4 @ 2026-11-12 18:00:00 60',
  'a new objective replaces the old one without changing the schedule'
);

select throws_ok(
  $$ update public.study_sessions set objective = repeat('x', 501) $$,
  '23514', null, 'objectives longer than 500 characters are rejected'
);
select is((select objective from public.study_sessions), 'Finish problem set 4', 'a rejected objective keeps the saved one');

update public.study_sessions set objective = '   ';
select is((select objective from public.study_sessions), null, 'a blank objective is stored as none');

update public.study_sessions set objective = 'Flashcards';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select is_empty(
  $$ update public.study_sessions set objective = 'Sneaky' returning id $$,
  'other students cannot change the objective'
);
select is_empty(
  $$ select objective from public.study_sessions $$,
  'other students cannot read the objective'
);

select * from finish();
rollback;
