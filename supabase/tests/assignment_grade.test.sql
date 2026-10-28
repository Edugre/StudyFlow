-- AT-10: grades on completed tasks.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select throws_ok(
  $$ insert into public.assignments (title, grade) values ('Quiz', 90) $$,
  '42501', null, 'tasks cannot be created with a grade'
);
insert into public.assignments (title) values ('Essay');
select throws_ok(
  $$ update public.assignments set grade = 90 $$,
  '23514', null, 'open tasks cannot be graded'
);

update public.assignments set completed_at = now();
select lives_ok(
  $$ update public.assignments set grade = 92.5 $$,
  'completed tasks can be graded'
);
select is((select grade from public.assignments), 92.50::numeric(5,2), 'the grade is saved');
select throws_ok(
  $$ update public.assignments set grade = 100.01 $$,
  '23514', null, 'grades above 100 are rejected'
);
select throws_ok(
  $$ update public.assignments set grade = -1 $$,
  '23514', null, 'negative grades are rejected'
);
select is((select grade from public.assignments), 92.50::numeric(5,2), 'rejected grades keep the saved one');

select * from finish();
rollback;
