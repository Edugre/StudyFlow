-- RN-06: students can turn reminders off for one task.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

-- "Soon" deadlines fall inside the default 60-minute lead; "past" ones have
-- just been missed. Times are UTC wall time.
select set_config('test.soon_on', (((now() + interval '30 minutes') at time zone 'UTC')::date)::text, true);
select set_config('test.soon_time', (((now() + interval '30 minutes') at time zone 'UTC')::time(0))::text, true);
select set_config('test.past_on', (((now() - interval '2 hours') at time zone 'UTC')::date)::text, true);
select set_config('test.past_time', (((now() - interval '2 hours') at time zone 'UTC')::time(0))::text, true);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

insert into public.assignments (title, kind, due_on, due_time) values
  ('Loud essay', 'assignment', current_setting('test.soon_on')::date, current_setting('test.soon_time')::time),
  ('Loud late task', 'assignment', current_setting('test.past_on')::date, current_setting('test.past_time')::time);
insert into public.assignments (title, kind, due_on, due_time, reminders_enabled) values
  ('Muted essay', 'assignment', current_setting('test.soon_on')::date, current_setting('test.soon_time')::time, false),
  ('Muted exam', 'exam', current_setting('test.soon_on')::date, current_setting('test.soon_time')::time, false),
  ('Muted late task', 'assignment', current_setting('test.past_on')::date, current_setting('test.past_time')::time, false);

select is(
  (select reminders_enabled from public.assignments where title = 'Loud essay'),
  true,
  'reminders are on for new tasks'
);
select throws_ok(
  $$ update public.assignments set reminders_enabled = null where title = 'Loud essay' $$,
  '23502', null, 'a task''s reminders are either on or off'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
insert into public.assignments (title, due_on, due_time) values
  ('Other student''s essay', current_setting('test.soon_on')::date, current_setting('test.soon_time')::time);
select is_empty(
  $$ update public.assignments set reminders_enabled = false
     where title = 'Loud essay' returning id $$,
  'students cannot change another student''s task'
);

reset role;
select public.generate_reminders();

select is(
  (select count(*)::int from public.notifications n
   join public.assignments a on a.id = n.source_id
   where a.title in ('Muted essay', 'Muted exam')),
  0,
  'a task with reminders off is not reminded'
);
select is(
  (select count(*)::int from public.notifications n
   join public.assignments a on a.id = n.source_id
   where a.title = 'Loud essay'),
  1,
  'turning one task off does not silence another'
);
select is(
  (select count(*)::int from public.notifications n
   join public.assignments a on a.id = n.source_id
   where a.title = 'Muted late task'),
  0,
  'a task with reminders off gets no overdue notice'
);
select is(
  (select count(*)::int from public.notifications n
   join public.assignments a on a.id = n.source_id
   where a.title = 'Loud late task' and n.source_type = 'overdue'),
  1,
  'other overdue tasks still get their notice'
);
select is(
  (select count(*)::int from public.notifications
   where owner_id = '00000000-0000-0000-0000-00000000000b'),
  1,
  'other students are unaffected'
);

-- Turning reminders back on resumes them; turning them off keeps history.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
update public.assignments set reminders_enabled = true where title = 'Muted essay';
update public.assignments set reminders_enabled = false where title = 'Loud essay';

reset role;
select public.generate_reminders();
select is(
  (select count(*)::int from public.notifications n
   join public.assignments a on a.id = n.source_id
   where a.title = 'Muted essay'),
  1,
  'turning a task''s reminders back on resumes them'
);
select is(
  (select count(*)::int from public.notifications n
   join public.assignments a on a.id = n.source_id
   where a.title = 'Loud essay'),
  1,
  'reminders already delivered stay in the history'
);

select * from finish();
rollback;
