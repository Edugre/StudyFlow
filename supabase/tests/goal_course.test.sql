-- GP-03: goals linked to courses.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');
insert into public.courses (id, owner_id, name) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000a', 'Math'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-00000000000a', 'Biology'),
  ('00000000-0000-0000-0000-0000000000cb', '00000000-0000-0000-0000-00000000000b', 'B course');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

insert into public.goals (title, message, course_id) values
  ('Pass calculus', 'Score a B', '00000000-0000-0000-0000-0000000000c1'),
  ('Learn cells', 'Know the organelles', '00000000-0000-0000-0000-0000000000c2');
insert into public.goals (title, message) values ('Read more', 'Two books');

select results_eq(
  $$ select title from public.goals where course_id = '00000000-0000-0000-0000-0000000000c1' $$,
  $$ values ('Pass calculus'::text) $$,
  'a course lists only the goals linked to it'
);

update public.goals set course_id = '00000000-0000-0000-0000-0000000000c2'
  where title = 'Pass calculus';
select is(
  (select count(*)::int from public.goals where course_id = '00000000-0000-0000-0000-0000000000c2'),
  2,
  'a goal can be moved to another course'
);

select throws_ok(
  $$ update public.goals set course_id = '00000000-0000-0000-0000-0000000000cb'
     where title = 'Read more' $$,
  '42501', null, 'goals cannot be linked to another student''s course'
);
select throws_ok(
  $$ insert into public.goals (title, message, course_id)
     values ('Sneaky', 'Link', '00000000-0000-0000-0000-0000000000cb') $$,
  '42501', null, 'new goals cannot be linked to another student''s course'
);

delete from public.courses where id = '00000000-0000-0000-0000-0000000000c2';
select is((select count(*)::int from public.goals), 3, 'deleting a course keeps its goals');
select is(
  (select count(*)::int from public.goals where course_id is null),
  3,
  'goals of a deleted course are unlinked'
);

select * from finish();
rollback;
