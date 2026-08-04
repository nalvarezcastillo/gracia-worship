create table if not exists public.microphone_assignments (
  id uuid primary key default gen_random_uuid(),
  leader_name text not null check (char_length(trim(leader_name)) > 0),
  microphone_name text not null check (char_length(trim(microphone_name)) > 0),
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now()
);

-- Normalize older versions of this table that used person_name.
alter table public.microphone_assignments
add column if not exists leader_name text;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'microphone_assignments'
      and column_name = 'person_name'
  ) then
    execute 'update public.microphone_assignments
             set leader_name = person_name
             where leader_name is null and person_name is not null';
  end if;
end
$$;

alter table public.microphone_assignments
alter column leader_name set not null;

alter table public.microphone_assignments
drop column if exists person_name,
drop column if exists updated_at;

create index if not exists microphone_assignments_position_idx
on public.microphone_assignments (position, created_at);

alter table public.microphone_assignments enable row level security;

drop policy if exists "Public can read microphone assignments" on public.microphone_assignments;
create policy "Public can read microphone assignments"
on public.microphone_assignments
for select
to public
using (true);

drop policy if exists "Authenticated can insert microphone assignments" on public.microphone_assignments;
create policy "Authenticated can insert microphone assignments"
on public.microphone_assignments
for insert
to authenticated
with check (true);

drop policy if exists "Authenticated can update microphone assignments" on public.microphone_assignments;
create policy "Authenticated can update microphone assignments"
on public.microphone_assignments
for update
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated can delete microphone assignments" on public.microphone_assignments;
create policy "Authenticated can delete microphone assignments"
on public.microphone_assignments
for delete
to authenticated
using (true);

revoke insert, update, delete on public.microphone_assignments from anon;
grant select on public.microphone_assignments to anon, authenticated;
grant insert, update, delete on public.microphone_assignments to authenticated;
