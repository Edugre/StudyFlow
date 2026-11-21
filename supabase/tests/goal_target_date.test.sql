-- GP-02: goal target dates.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

insert into public.goals (title, message) values ('Pass calculus', 'Score a B');
select is((select target_date from public.goals), null, 'goals start without a target date');

update public.goals set target_date = '2026-12-15';
select is((select target_date from public.goals), '2026-12-15'::date, 'a target date is saved');

select throws_ok(
  $$ update public.goals set target_date = '2026-02-30' $$,
  '22008', null, 'impossible dates are rejected'
);
select is((select target_date from public.goals), '2026-12-15'::date, 'a rejected date keeps the saved one');

insert into public.goals (title, message, target_date) values ('Read', 'Two books', '2027-01-10');
select is(
  (select target_date from public.goals where title = 'Read'),
  '2027-01-10'::date,
  'a goal can be created with a target date'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select is_empty(
  $$ update public.goals set target_date = '2030-01-01' returning id $$,
  'other students cannot change the target date'
);

select * from finish();
rollback;
