create table if not exists public.current_service_team (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid null references public.team_members(id) on delete set null,
  person_name text not null check (char_length(trim(person_name)) > 0),
  role_name text not null check (char_length(trim(role_name)) > 0),
  microphone_name text null,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now()
);

create index if not exists current_service_team_sort_order_idx
on public.current_service_team(sort_order);

alter table public.current_service_team enable row level security;
drop policy if exists "Public can read current service team" on public.current_service_team;
create policy "Public can read current service team" on public.current_service_team for select to anon, authenticated using (true);
drop policy if exists "Authenticated can insert current service team" on public.current_service_team;
create policy "Authenticated can insert current service team" on public.current_service_team for insert to authenticated with check (true);
drop policy if exists "Authenticated can update current service team" on public.current_service_team;
create policy "Authenticated can update current service team" on public.current_service_team for update to authenticated using (true) with check (true);
drop policy if exists "Authenticated can delete current service team" on public.current_service_team;
create policy "Authenticated can delete current service team" on public.current_service_team for delete to authenticated using (true);
revoke insert, update, delete on public.current_service_team from anon;
grant select on public.current_service_team to anon, authenticated;
grant insert, update, delete on public.current_service_team to authenticated;
