-- GP-01: match the other tables' privileges. Students write only a goal's
-- title and description, never its id or owner. Revoking the table-wide
-- insert also drops its column grants, so they are granted again.
revoke insert on public.goals from authenticated;
grant insert (title, message) on public.goals to authenticated;

-- clock_timestamp keeps goals saved in one transaction in creation order.
alter table public.goals alter column created_at set default clock_timestamp();
