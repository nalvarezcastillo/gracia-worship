create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(trim(name)) > 0),
  instrument text null,
  active boolean not null default true,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now()
);

create index if not exists team_members_active_sort_name_idx
on public.team_members(active, sort_order, name);

alter table public.team_members enable row level security;
drop policy if exists "Public can read team members" on public.team_members;
create policy "Public can read team members" on public.team_members for select to anon, authenticated using (true);
drop policy if exists "Authenticated can insert team members" on public.team_members;
create policy "Authenticated can insert team members" on public.team_members for insert to authenticated with check (true);
drop policy if exists "Authenticated can update team members" on public.team_members;
create policy "Authenticated can update team members" on public.team_members for update to authenticated using (true) with check (true);
drop policy if exists "Authenticated can delete team members" on public.team_members;
create policy "Authenticated can delete team members" on public.team_members for delete to authenticated using (true);
revoke insert, update, delete on public.team_members from anon;
grant select on public.team_members to anon, authenticated;
grant insert, update, delete on public.team_members to authenticated;
