-- AT-05: task priorities.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

insert into public.assignments (title) values ('Essay'), ('Lab');
select is(
  (select count(*)::int from public.assignments where priority = 'medium'), 2,
  'tasks default to Medium priority'
);

update public.assignments set priority = 'high' where title = 'Essay';
select is(
  (select priority from public.assignments where title = 'Essay'), 'high',
  'students can change a task''s priority'
);
select is(
  (select priority from public.assignments where title = 'Lab'), 'medium',
  'changing one task''s priority leaves other tasks unchanged'
);
select throws_ok(
  $$ insert into public.assignments (title, priority) values ('Quiz', 'urgent') $$,
  '23514', null, 'unknown priorities are rejected'
);

select * from finish();
rollback;
