-- Create Goal (GP-01)

create table public.goals (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    title text not null
        check (char_length(btrim(title)) between 1 and 120),
    message text not null
        check (char_length(btrim(message)) between 1 and 500),
    created_at timestamptz not null default now()
);

alter table public.goals enable row level security;

create policy "Students manage their own goals" on public.goals
    for all to authenticated
    using (owner_id = (select auth.uid()))
    with check (owner_id = (select auth.uid()));

revoke all on table public.goals from anon, authenticated;
grant select, insert, delete on public.goals to authenticated;
grant insert (title, message) on public.goals to authenticated;
grant update (title, message) on public.goals to authenticated;