begin;

create table if not exists public.service_item_responsibilities (
  id uuid primary key default gen_random_uuid(),
  service_id smallint not null,
  service_item_id uuid not null,
  service_team_assignment_id uuid not null,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  constraint service_item_responsibilities_item_fkey
    foreign key (service_id, service_item_id)
    references public.service_items(service_id, id)
    on delete cascade,
  constraint service_item_responsibilities_assignment_fkey
    foreign key (service_id, service_team_assignment_id)
    references public.service_team_assignments(service_id, id),
  constraint service_item_responsibilities_item_assignment_key
    unique (service_item_id, service_team_assignment_id)
);

create index if not exists service_item_responsibilities_service_item_sort_idx
on public.service_item_responsibilities(service_id, service_item_id, sort_order, created_at);

alter table public.service_item_responsibilities enable row level security;

drop policy if exists "Public can read service item responsibilities" on public.service_item_responsibilities;
create policy "Public can read service item responsibilities"
on public.service_item_responsibilities for select
to anon, authenticated
using (true);

revoke all on public.service_item_responsibilities from anon, authenticated;
grant select on public.service_item_responsibilities to anon, authenticated;

create or replace function public.set_service_item_responsibilities(
  p_service_id smallint,
  p_service_item_id uuid,
  p_assignment_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_status text;
  requested_ids uuid[] := coalesce(p_assignment_ids, '{}'::uuid[]);
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_service_id is null or p_service_item_id is null then
    raise exception 'Service and service item are required';
  end if;

  perform pg_advisory_xact_lock(71835, p_service_id::integer);

  select service.status into target_status
  from public.active_setlist service
  where service.id = p_service_id
  for update;
  if not found then
    raise exception 'No se encontró el servicio.';
  end if;
  if target_status not in ('planned', 'active') then
    raise exception 'Solo se pueden editar responsabilidades de servicios planificados o activos.';
  end if;

  perform 1
  from public.service_items item
  where item.service_id = p_service_id
    and item.id = p_service_item_id
  for update;
  if not found then
    raise exception 'El elemento no pertenece a este servicio.';
  end if;

  if cardinality(requested_ids) <> (
    select count(distinct requested.assignment_id)
    from unnest(requested_ids) requested(assignment_id)
  ) then
    raise exception 'No se permiten responsables duplicados.';
  end if;

  if exists (
    select 1
    from unnest(requested_ids) requested(assignment_id)
    left join public.service_team_assignments assignment
      on assignment.service_id = p_service_id
      and assignment.id = requested.assignment_id
    where assignment.id is null
  ) then
    raise exception 'Todas las asignaciones deben pertenecer al equipo de este servicio.';
  end if;

  delete from public.service_item_responsibilities
  where service_id = p_service_id
    and service_item_id = p_service_item_id;

  insert into public.service_item_responsibilities (
    service_id,
    service_item_id,
    service_team_assignment_id,
    sort_order
  )
  select p_service_id, p_service_item_id, requested.assignment_id, requested.ordinality - 1
  from unnest(requested_ids) with ordinality requested(assignment_id, ordinality)
  order by requested.ordinality;
end;
$$;

revoke all on function public.set_service_item_responsibilities(smallint, uuid, uuid[])
from public, anon, authenticated;
grant execute on function public.set_service_item_responsibilities(smallint, uuid, uuid[])
to authenticated;

-- PRE-APPLY VERIFICATION (read-only):
-- select to_regclass('public.service_item_responsibilities') as existing_table;
-- select to_regprocedure('public.set_service_item_responsibilities(smallint,uuid,uuid[])') as existing_rpc;
-- select conname, pg_get_constraintdef(oid)
-- from pg_constraint
-- where conrelid in ('public.service_items'::regclass, 'public.service_team_assignments'::regclass)
--   and conname in ('service_items_service_id_id_key', 'service_team_assignments_service_id_id_key')
-- order by conname;

-- POST-APPLY VERIFICATION (read-only):
-- select to_regclass('public.service_item_responsibilities') as installed_table;
-- select to_regprocedure('public.set_service_item_responsibilities(smallint,uuid,uuid[])') as installed_rpc;
-- select conname, pg_get_constraintdef(oid)
-- from pg_constraint
-- where conrelid = 'public.service_item_responsibilities'::regclass
-- order by conname;
-- select grantee, privilege_type
-- from information_schema.routine_privileges
-- where routine_schema = 'public' and routine_name = 'set_service_item_responsibilities'
-- order by grantee, privilege_type;

notify pgrst, 'reload schema';

commit;
