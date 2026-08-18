begin;

create table if not exists public.service_team_assignments (
  id uuid primary key default gen_random_uuid(),
  service_id smallint not null references public.active_setlist(id) on delete cascade,
  team_member_id uuid null references public.team_members(id) on delete set null,
  person_name text not null check (char_length(trim(person_name)) > 0),
  role_name text not null check (char_length(trim(role_name)) > 0),
  microphone_name text null,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_team_assignments_service_id_id_key unique (service_id, id)
);

create index if not exists service_team_assignments_service_sort_created_idx
on public.service_team_assignments(service_id, sort_order, created_at);

create index if not exists service_team_assignments_service_member_idx
on public.service_team_assignments(service_id, team_member_id)
where team_member_id is not null;

create table if not exists public.service_team_assignment_resources (
  id uuid primary key default gen_random_uuid(),
  service_id smallint not null,
  assignment_id uuid not null,
  resource_id uuid not null references public.resources(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint service_team_assignment_resources_assignment_fkey
    foreign key (service_id, assignment_id)
    references public.service_team_assignments(service_id, id)
    on delete cascade,
  constraint service_team_assignment_resources_assignment_resource_key
    unique (assignment_id, resource_id),
  constraint service_team_assignment_resources_service_resource_key
    unique (service_id, resource_id)
);

create index if not exists service_team_assignment_resources_service_assignment_idx
on public.service_team_assignment_resources(service_id, assignment_id);

alter table public.service_team_assignments enable row level security;

drop policy if exists "Public can read service team assignments" on public.service_team_assignments;
create policy "Public can read service team assignments"
on public.service_team_assignments for select
to anon, authenticated
using (true);

drop policy if exists "Authenticated can insert service team assignments" on public.service_team_assignments;
create policy "Authenticated can insert service team assignments"
on public.service_team_assignments for insert
to authenticated
with check (true);

drop policy if exists "Authenticated can update service team assignments" on public.service_team_assignments;
create policy "Authenticated can update service team assignments"
on public.service_team_assignments for update
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated can delete service team assignments" on public.service_team_assignments;
create policy "Authenticated can delete service team assignments"
on public.service_team_assignments for delete
to authenticated
using (true);

revoke all on public.service_team_assignments from anon, authenticated;
grant select on public.service_team_assignments to anon, authenticated;
grant insert, update, delete on public.service_team_assignments to authenticated;

alter table public.service_team_assignment_resources enable row level security;

drop policy if exists "Public can read service team assignment resources" on public.service_team_assignment_resources;
create policy "Public can read service team assignment resources"
on public.service_team_assignment_resources for select
to anon, authenticated
using (true);

drop policy if exists "Authenticated can insert service team assignment resources" on public.service_team_assignment_resources;
create policy "Authenticated can insert service team assignment resources"
on public.service_team_assignment_resources for insert
to authenticated
with check (true);

drop policy if exists "Authenticated can update service team assignment resources" on public.service_team_assignment_resources;
create policy "Authenticated can update service team assignment resources"
on public.service_team_assignment_resources for update
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated can delete service team assignment resources" on public.service_team_assignment_resources;
create policy "Authenticated can delete service team assignment resources"
on public.service_team_assignment_resources for delete
to authenticated
using (true);

revoke all on public.service_team_assignment_resources from anon, authenticated;
grant select on public.service_team_assignment_resources to anon, authenticated;
grant insert, update, delete on public.service_team_assignment_resources to authenticated;

create or replace function public.set_service_team_assignment_resources(
  p_assignment_id uuid,
  p_resource_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_service_id smallint;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select assignment.service_id into target_service_id
  from public.service_team_assignments assignment
  where assignment.id = p_assignment_id
  for update;

  if not found then
    raise exception 'Service team assignment not found';
  end if;

  if cardinality(coalesce(p_resource_ids, '{}'::uuid[])) <> (
    select count(distinct requested.resource_id)
    from unnest(coalesce(p_resource_ids, '{}'::uuid[])) requested(resource_id)
  ) then
    raise exception 'Duplicate resource IDs are not allowed';
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_resource_ids, '{}'::uuid[])) requested(resource_id)
    left join public.resources resource on resource.id = requested.resource_id
    where resource.id is null or resource.active is not true
  ) then
    raise exception 'Every resource must exist and be active';
  end if;

  delete from public.service_team_assignment_resources
  where assignment_id = p_assignment_id;

  insert into public.service_team_assignment_resources (
    service_id,
    assignment_id,
    resource_id
  )
  select target_service_id, p_assignment_id, requested.resource_id
  from unnest(coalesce(p_resource_ids, '{}'::uuid[])) requested(resource_id);
end;
$$;

revoke all on function public.set_service_team_assignment_resources(uuid, uuid[])
from public, anon, authenticated;
grant execute on function public.set_service_team_assignment_resources(uuid, uuid[])
to authenticated;

do $$
declare
  active_service_count integer;
  target_service_id smallint;
begin
  select count(*), min(id)
  into active_service_count, target_service_id
  from public.active_setlist
  where status = 'active';

  if active_service_count = 0 then
    raise exception 'Cannot migrate current service team: no active service exists';
  end if;

  if active_service_count > 1 then
    raise exception 'Cannot migrate current service team: more than one active service exists';
  end if;

  if exists (
    select 1
    from public.current_service_team legacy
    join public.service_team_assignments scoped on scoped.id = legacy.id
    where scoped.service_id <> target_service_id
  ) then
    raise exception 'Cannot migrate current service team: an assignment ID belongs to another service';
  end if;

  insert into public.service_team_assignments (
    id,
    service_id,
    team_member_id,
    person_name,
    role_name,
    microphone_name,
    sort_order,
    created_at,
    updated_at
  )
  select
    legacy.id,
    target_service_id,
    legacy.team_member_id,
    legacy.person_name,
    legacy.role_name,
    legacy.microphone_name,
    legacy.sort_order,
    legacy.created_at,
    legacy.created_at
  from public.current_service_team legacy
  on conflict (id) do nothing;

  if exists (
    select 1
    from public.current_service_team legacy
    left join public.service_team_assignments scoped
      on scoped.id = legacy.id
      and scoped.service_id = target_service_id
    where scoped.id is null
      or scoped.team_member_id is distinct from legacy.team_member_id
      or scoped.person_name is distinct from legacy.person_name
      or scoped.role_name is distinct from legacy.role_name
      or scoped.microphone_name is distinct from legacy.microphone_name
      or scoped.sort_order is distinct from legacy.sort_order
      or scoped.created_at is distinct from legacy.created_at
  ) then
    raise exception 'Cannot migrate current service team: existing scoped assignment differs from legacy data';
  end if;

  if exists (
    select 1
    from public.current_service_team_resources legacy_link
    join public.service_team_assignment_resources scoped_link on scoped_link.id = legacy_link.id
    where scoped_link.service_id <> target_service_id
      or scoped_link.assignment_id <> legacy_link.service_team_id
      or scoped_link.resource_id <> legacy_link.resource_id
  ) then
    raise exception 'Cannot migrate current service resources: a resource-link ID conflicts';
  end if;

  insert into public.service_team_assignment_resources (
    id,
    service_id,
    assignment_id,
    resource_id,
    created_at
  )
  select
    legacy_link.id,
    target_service_id,
    legacy_link.service_team_id,
    legacy_link.resource_id,
    legacy_link.created_at
  from public.current_service_team_resources legacy_link
  on conflict (id) do nothing;

  if exists (
    select 1
    from public.current_service_team_resources legacy_link
    left join public.service_team_assignment_resources scoped_link
      on scoped_link.id = legacy_link.id
      and scoped_link.service_id = target_service_id
      and scoped_link.assignment_id = legacy_link.service_team_id
      and scoped_link.resource_id = legacy_link.resource_id
    where scoped_link.id is null
  ) then
    raise exception 'Cannot migrate current service resources: scoped links differ from legacy data';
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
