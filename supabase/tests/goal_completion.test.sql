-- GP-05: goal completion.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select throws_ok(
  $$ insert into public.goals (title, message, completed_at) values ('Done', 'Desc', now()) $$,
  '42501', null, 'goals cannot be created as completed'
);
insert into public.goals (title, message) values ('Pass calculus', 'Score a B');
select is((select completed_at from public.goals), null, 'new goals are active');

update public.goals set progress = 40;
update public.goals set completed_at = '2000-01-01';
select ok(
  (select completed_at > '2020-01-01' from public.goals),
  'the database records its own completion time'
);
select is((select progress from public.goals), 100::smallint, 'a completed goal is at 100%');
select set_config('test.first_completion', (select completed_at::text from public.goals), true);

update public.goals set completed_at = now() + interval '1 day';
select is(
  (select completed_at from public.goals),
  current_setting('test.first_completion')::timestamptz,
  'completing again keeps the first completion'
);
select is((select count(*)::int from public.goals where completed_at is not null), 1, 'the goal is counted once');
update public.goals set completed_at = null;
select is(
  (select completed_at from public.goals),
  current_setting('test.first_completion')::timestamptz,
  'completion cannot be undone'
);
update public.goals set progress = 10;
select is((select progress from public.goals), 100::smallint, 'a completed goal keeps 100%');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select is_empty(
  $$ update public.goals set completed_at = now() returning id $$,
  'other students cannot complete the goal'
);

select * from finish();
rollback;
