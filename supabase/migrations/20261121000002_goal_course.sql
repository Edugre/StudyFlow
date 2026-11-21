-- GP-03: a goal can be linked to one of the student's courses. Deleting the
-- course unlinks its goals instead of deleting them, as for coursework.
alter table public.goals
  add column course_id uuid references public.courses(id) on delete set null;
create index goals_owner_course on public.goals(owner_id, course_id);

-- The foreign key alone would accept another student's course id, so links
-- must also point at a course the student owns.
drop policy "Students manage their own goals" on public.goals;
create policy "Students manage their own goals" on public.goals
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and (course_id is null or exists (
      select 1 from public.courses c
      where c.id = course_id and c.owner_id = (select auth.uid())
    ))
  );

grant insert (course_id), update (course_id) on public.goals to authenticated;
