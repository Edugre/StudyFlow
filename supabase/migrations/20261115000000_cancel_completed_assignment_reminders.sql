-- RN-09: completing a task cancels its deadline reminders.
-- generate_reminders() already skips completed tasks, so a reminder that is
-- still pending is never created. This also withdraws one that was delivered
-- but not yet read, so the student is not reminded of a deadline they met.
-- Reminders the student already read stay in their notification history.

create function public.cancel_completed_assignment_reminders() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.notifications
  where owner_id = new.owner_id
    and source_type in ('assignment', 'exam')
    and source_id = new.id
    and read_at is null;
  return null;
end;
$$;

-- Students cannot delete notifications themselves, so the function runs as
-- its owner and is reachable only through the trigger.
revoke all on function public.cancel_completed_assignment_reminders()
  from public, anon, authenticated;

create trigger assignments_cancel_reminders after update on public.assignments
for each row when (old.completed_at is null and new.completed_at is not null)
execute function public.cancel_completed_assignment_reminders();
