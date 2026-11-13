
-- RN-01, RN-02, RN-03: Add student reminder preferences.

alter table public.student_settings
  add column assignment_reminders_enabled boolean not null default true,
  add column exam_reminders_enabled boolean not null default true,
  add column study_session_reminders_enabled boolean not null default true,
  add column reminder_lead_minutes integer not null default 60;

-- Keep reminder timing within a reasonable range.
alter table public.student_settings
  add constraint student_settings_reminder_lead_minutes_check
  check (reminder_lead_minutes between 5 and 10080);

-- Store in-app reminders for assignments, exams, and study sessions.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid()
    references auth.users(id) on delete cascade,

  source_type text not null
    check (source_type in ('assignment', 'exam', 'study_session')),

  source_id uuid not null,
  
  scheduled_for timestamptz not null,
  
  title text not null
    check (char_length(btrim(title)) between 1 and 120),

  message text not null
    check (char_length(btrim(message)) between 1 and 500),

  created_at timestamptz not null default now(),
  read_at timestamptz,

  constraint notifications_one_per_source
    unique (owner_id, source_type, source_id)
);

-- Find a student's newest notifications efficiently.
create index notifications_owner_created_at_idx
  on public.notifications (owner_id, created_at desc);

-- Protect notification records.
alter table public.notifications enable row level security;

create policy "Students view their own notifications"
  on public.notifications
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "Students update their own notification status"
  on public.notifications
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- Students can view notifications and mark them as read,
-- but cannot create or modify notification content themselves.
revoke all on public.notifications from anon, authenticated;

grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
-- Allow students to manage their own reminder preferences.
grant insert (
  assignment_reminders_enabled,
  exam_reminders_enabled,
  study_session_reminders_enabled,
  reminder_lead_minutes
) on public.student_settings to authenticated;

grant update (
  assignment_reminders_enabled,
  exam_reminders_enabled,
  study_session_reminders_enabled,
  reminder_lead_minutes
) on public.student_settings to authenticated;
