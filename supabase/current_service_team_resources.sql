create table if not exists public.current_service_team_resources (
  id uuid primary key default gen_random_uuid(),
  service_team_id uuid not null references public.current_service_team(id) on delete cascade,
  resource_id uuid not null references public.resources(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (service_team_id, resource_id),
  unique (resource_id)
);

create index if not exists current_service_team_resources_service_team_idx
on public.current_service_team_resources(service_team_id);

alter table public.current_service_team_resources enable row level security;

drop policy if exists "Public can read current service team resources" on public.current_service_team_resources;
create policy "Public can read current service team resources"
on public.current_service_team_resources for select
to anon, authenticated
using (true);

drop policy if exists "Authenticated can insert current service team resources" on public.current_service_team_resources;
create policy "Authenticated can insert current service team resources"
on public.current_service_team_resources for insert
to authenticated
with check (true);

drop policy if exists "Authenticated can delete current service team resources" on public.current_service_team_resources;
create policy "Authenticated can delete current service team resources"
on public.current_service_team_resources for delete
to authenticated
using (true);

revoke all on public.current_service_team_resources from anon, authenticated;
grant select on public.current_service_team_resources to anon, authenticated;
grant insert, delete on public.current_service_team_resources to authenticated;

create or replace function public.set_current_service_team_resources(
  target_service_team_id uuid,
  target_resource_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.current_service_team where id = target_service_team_id
  ) then
    raise exception 'Service team assignment not found';
  end if;

  if exists (
    select 1
    from unnest(coalesce(target_resource_ids, '{}'::uuid[])) as selected(resource_id)
    left join public.resources resource on resource.id = selected.resource_id
    where resource.id is null or resource.active is not true
  ) then
    raise exception 'Only active resources may be assigned';
  end if;

  delete from public.current_service_team_resources
  where service_team_id = target_service_team_id;

  insert into public.current_service_team_resources (service_team_id, resource_id)
  select target_service_team_id, selected.resource_id
  from (
    select distinct resource_id
    from unnest(coalesce(target_resource_ids, '{}'::uuid[])) as input(resource_id)
  ) as selected;
end;
$$;

grant execute on function public.set_current_service_team_resources(uuid, uuid[])
to authenticated;
