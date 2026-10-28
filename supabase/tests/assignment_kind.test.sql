-- AT-04: task types.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

insert into public.assignments (title) values ('Essay');
select is((select kind from public.assignments), 'assignment', 'tasks default to assignments');

select lives_ok(
  $$ update public.assignments set kind = 'exam' $$,
  'students can change a task''s type'
);
select is((select title from public.assignments), 'Essay', 'changing the type keeps the title');
select throws_ok(
  $$ insert into public.assignments (title, kind) values ('Lab', 'homework') $$,
  '23514', null, 'unknown task types are rejected'
);

select * from finish();
rollback;
