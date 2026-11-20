-- RN-08: students view their recent notifications.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com'),
  ('00000000-0000-0000-0000-00000000000c', 'c@example.com');

-- Notifications are only ever written by the reminder check, so the history
-- is set up directly. Two share a creation time, as one check's would.
insert into public.notifications
  (owner_id, source_type, source_id, scheduled_for, title, message, created_at, read_at)
values
  ('00000000-0000-0000-0000-00000000000a', 'assignment', gen_random_uuid(),
   now() - interval '2 days', 'Oldest, read', 'Essay is due.', now() - interval '2 days', now() - interval '1 day'),
  ('00000000-0000-0000-0000-00000000000a', 'exam', gen_random_uuid(),
   now() - interval '22 hours', 'Same check, later event', 'Midterm is scheduled.', now() - interval '1 day', null),
  ('00000000-0000-0000-0000-00000000000a', 'study_session', gen_random_uuid(),
   now() - interval '23 hours', 'Same check, earlier event', 'Your study session is scheduled.', now() - interval '1 day', null),
  ('00000000-0000-0000-0000-00000000000a', 'assignment', gen_random_uuid(),
   now() - interval '1 hour', 'Newest', 'Lab report is due.', now() - interval '1 hour', null),
  ('00000000-0000-0000-0000-00000000000b', 'assignment', gen_random_uuid(),
   now(), 'Another student''s', 'Not yours.', now(), null);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

-- The order the Notifications page asks for (listNotifications).
select results_eq(
  $$ select title from public.notifications
     order by created_at desc, scheduled_for desc, id $$,
  $$ values ('Newest'), ('Same check, later event'), ('Same check, earlier event'), ('Oldest, read') $$,
  'notifications are listed newest first'
);
select is(
  (select count(*)::int from public.notifications
   where message is not null and created_at is not null),
  4,
  'every notification, read or unread, has its message and time'
);

select throws_ok(
  $$ insert into public.notifications (source_type, source_id, scheduled_for, title, message)
     values ('assignment', gen_random_uuid(), now(), 'Fake', 'Fake') $$,
  '42501', null, 'students cannot create notifications'
);
select throws_ok(
  $$ update public.notifications set message = 'Changed' $$,
  '42501', null, 'students cannot change a notification''s message'
);
select lives_ok(
  $$ update public.notifications set read_at = now() where title = 'Newest' $$,
  'students mark a notification as read'
);
select is(
  (select count(*)::int from public.notifications where read_at is not null),
  2,
  'read notifications stay in the history'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select results_eq(
  $$ select title from public.notifications $$,
  $$ values ('Another student''s') $$,
  'students see only their own notifications'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
select is_empty(
  $$ select * from public.notifications $$,
  'a student with no notifications gets an empty history'
);

select * from finish();
rollback;
