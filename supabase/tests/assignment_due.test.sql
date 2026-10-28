-- AT-03: task deadlines.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

insert into public.assignments (title) values ('Essay');
select is(
  (select due_on from public.assignments), null::date,
  'tasks have no deadline by default'
);
select lives_ok(
  $$ update public.assignments set due_on = '2026-11-02', due_time = '18:00' $$,
  'students can set a due date and time'
);
select throws_ok(
  $$ update public.assignments set due_on = null $$,
  '23514', null, 'a due time cannot exist without a due date'
);
select throws_ok(
  $$ update public.assignments set due_on = '2026-02-30' $$,
  '22008', null, 'impossible dates are rejected'
);
select results_eq(
  $$ select due_on, due_time from public.assignments $$,
  $$ values ('2026-11-02'::date, '18:00'::time) $$,
  'rejected changes keep the saved deadline'
);

select * from finish();
rollback;
