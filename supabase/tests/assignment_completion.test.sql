-- AT-06: task completion.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select throws_ok(
  $$ insert into public.assignments (title, completed_at) values ('Done', now()) $$,
  '42501', null, 'tasks cannot be created as completed'
);
insert into public.assignments (title) values ('Essay');
select is((select completed_at from public.assignments), null, 'new tasks are open');

update public.assignments set completed_at = '2000-01-01';
select ok(
  (select completed_at > '2020-01-01' from public.assignments),
  'the database records its own completion time'
);
select set_config('test.first_completion', (select completed_at::text from public.assignments), true);

update public.assignments set completed_at = now() + interval '1 day';
select is(
  (select completed_at from public.assignments),
  current_setting('test.first_completion')::timestamptz,
  'completing again keeps the first completion'
);
update public.assignments set completed_at = null;
select is(
  (select completed_at from public.assignments),
  current_setting('test.first_completion')::timestamptz,
  'completion cannot be undone'
);
update public.assignments set title = 'Final essay';
select is(
  (select completed_at from public.assignments),
  current_setting('test.first_completion')::timestamptz,
  'other edits keep the completion'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select is_empty(
  $$ update public.assignments set completed_at = now() returning id $$,
  'other students cannot complete the task'
);

select * from finish();
rollback;
