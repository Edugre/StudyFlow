-- SP-08: study session cancellation.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select throws_ok(
  $$ insert into public.study_sessions (starts_on, start_time, duration_minutes, canceled_at)
     values ('2026-11-12', '18:00', 60, now()) $$,
  '42501', null, 'sessions cannot be created as canceled'
);
insert into public.study_sessions (starts_on, start_time, duration_minutes)
  values ('2026-11-12', '18:00', 60), ('2026-11-13', '18:00', 60);
select is(
  (select count(*)::int from public.study_sessions where canceled_at is null),
  2, 'new sessions are scheduled'
);

update public.study_sessions set canceled_at = '2000-01-01' where starts_on = '2026-11-12';
select ok(
  (select canceled_at > '2020-01-01' from public.study_sessions where starts_on = '2026-11-12'),
  'the database records its own cancellation time'
);
select set_config('test.canceled',
  (select canceled_at::text from public.study_sessions where starts_on = '2026-11-12'), true);

update public.study_sessions set canceled_at = now() + interval '1 day' where starts_on = '2026-11-12';
select is(
  (select canceled_at from public.study_sessions where starts_on = '2026-11-12'),
  current_setting('test.canceled')::timestamptz,
  'canceling again keeps the first cancellation'
);
update public.study_sessions set canceled_at = null where starts_on = '2026-11-12';
select is(
  (select canceled_at from public.study_sessions where starts_on = '2026-11-12'),
  current_setting('test.canceled')::timestamptz,
  'cancellation cannot be undone'
);
select is(
  (select count(*)::int from public.study_sessions), 2,
  'a canceled session stays saved'
);

select throws_ok(
  $$ update public.study_sessions set completed_at = now() where starts_on = '2026-11-12' $$,
  '23514', null, 'a canceled session cannot be completed'
);
update public.study_sessions set completed_at = now() where starts_on = '2026-11-13';
select throws_ok(
  $$ update public.study_sessions set canceled_at = now() where starts_on = '2026-11-13' $$,
  '23514', null, 'a completed session cannot be canceled'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select is_empty(
  $$ update public.study_sessions set canceled_at = now() returning id $$,
  'other students cannot cancel the session'
);

select * from finish();
rollback;
