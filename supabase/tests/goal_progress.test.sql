-- GP-04: goal progress.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select throws_ok(
  $$ insert into public.goals (title, message, progress) values ('Head start', 'Desc', 50) $$,
  '42501', null, 'goals cannot be created with progress'
);
insert into public.goals (title, message) values ('Pass calculus', 'Score a B');
select is((select progress from public.goals), 0::smallint, 'new goals start at 0%');

update public.goals set progress = 40;
select is((select progress from public.goals), 40::smallint, 'progress is saved');
update public.goals set progress = 100;
select is((select progress from public.goals), 100::smallint, '100% is allowed');

select throws_ok(
  $$ update public.goals set progress = 101 $$,
  '23514', null, 'progress above 100% is rejected'
);
select throws_ok(
  $$ update public.goals set progress = -1 $$,
  '23514', null, 'negative progress is rejected'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select is_empty(
  $$ update public.goals set progress = 0 returning id $$,
  'other students cannot change the progress'
);

select * from finish();
rollback;
