-- GP-01: academic goals: constraints, RLS isolation and privileges.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select lives_ok(
  $$ insert into public.goals (title, message) values ('Pass calculus', 'Score at least a B on every exam') $$,
  'a student saves a goal with a description'
);
select results_eq(
  $$ select title, message, owner_id from public.goals $$,
  $$ values ('Pass calculus'::text, 'Score at least a B on every exam'::text,
             '00000000-0000-0000-0000-00000000000a'::uuid) $$,
  'the goal is saved once and belongs to the student'
);
select throws_ok(
  $$ insert into public.goals (title, message) values ('Blank', '   ') $$,
  '23514', null, 'a blank description is rejected'
);
select throws_ok(
  $$ insert into public.goals (title, message) values ('  ', 'Description') $$,
  '23514', null, 'a blank title is rejected'
);
select is((select count(*)::int from public.goals), 1, 'rejected goals are not created');
select throws_ok(
  $$ insert into public.goals (id, title, message)
     values (gen_random_uuid(), 'Chosen id', 'Description') $$,
  '42501', null, 'goal ids cannot be chosen'
);
select throws_ok(
  $$ update public.goals set owner_id = '00000000-0000-0000-0000-00000000000b' $$,
  '42501', null, 'goals cannot be given to another student'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select is_empty($$ select * from public.goals $$, 'other students see no goals');
select is_empty($$ delete from public.goals returning id $$, 'other students cannot delete goals');

reset role;
set local role anon;
select throws_ok($$ select * from public.goals $$, '42501', null, 'anonymous users have no access');

select * from finish();
rollback;
