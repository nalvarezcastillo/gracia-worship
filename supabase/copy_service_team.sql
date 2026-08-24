begin;

create or replace function public.copy_service_team(
  p_source_service_id smallint,
  p_target_service_id smallint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_status text;
  source_assignment record;
  new_assignment_id uuid;
  assignment_count integer;
  people_count integer;
  resource_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_source_service_id is null or p_target_service_id is null then
    raise exception 'Source and target services are required';
  end if;
  if p_source_service_id = p_target_service_id then
    raise exception 'El servicio de origen y el servicio actual deben ser diferentes.';
  end if;

  perform pg_advisory_xact_lock(71834, p_target_service_id::integer);

  select service.status into target_status
  from public.active_setlist service
  where service.id = p_target_service_id
  for update;
  if not found then
    raise exception 'No se encontró el servicio actual.';
  end if;
  if target_status not in ('planned', 'active') then
    raise exception 'Solo se puede copiar equipo a un servicio planificado o activo.';
  end if;
  if not exists (select 1 from public.active_setlist where id = p_source_service_id) then
    raise exception 'No se encontró el servicio de origen.';
  end if;
  if exists (select 1 from public.service_team_assignments where service_id = p_target_service_id) then
    raise exception 'Este servicio ya tiene un equipo asignado.';
  end if;
  if not exists (select 1 from public.service_team_assignments where service_id = p_source_service_id) then
    raise exception 'El servicio de origen no tiene asignaciones de equipo.';
  end if;

  if exists (
    select 1
    from public.service_team_assignment_resources source_link
    left join public.resources resource on resource.id = source_link.resource_id
    where source_link.service_id = p_source_service_id
      and resource.id is null
  ) then
    raise exception 'El equipo de origen contiene un recurso que ya no existe.';
  end if;
  if exists (
    select 1
    from public.service_team_assignment_resources source_link
    join public.resources resource on resource.id = source_link.resource_id
    where source_link.service_id = p_source_service_id
      and resource.active is not true
  ) then
    raise exception 'El equipo de origen contiene un recurso inactivo.';
  end if;
  if exists (
    select 1
    from public.service_team_assignment_resources source_link
    join public.service_team_assignment_resources target_link
      on target_link.service_id = p_target_service_id
      and target_link.resource_id = source_link.resource_id
    where source_link.service_id = p_source_service_id
  ) then
    raise exception 'Un recurso del equipo de origen ya está asignado en el servicio actual.';
  end if;

  select count(*), count(distinct lower(btrim(person_name)))
  into assignment_count, people_count
  from public.service_team_assignments
  where service_id = p_source_service_id;

  select count(*) into resource_count
  from public.service_team_assignment_resources
  where service_id = p_source_service_id;

  for source_assignment in
    select assignment.*
    from public.service_team_assignments assignment
    where assignment.service_id = p_source_service_id
    order by assignment.sort_order, assignment.created_at, assignment.id
  loop
    new_assignment_id := gen_random_uuid();
    insert into public.service_team_assignments (
      id, service_id, team_member_id, person_name, role_name,
      microphone_name, sort_order, created_at, updated_at
    ) values (
      new_assignment_id, p_target_service_id, source_assignment.team_member_id,
      source_assignment.person_name, source_assignment.role_name,
      source_assignment.microphone_name, source_assignment.sort_order, now(), now()
    );

    insert into public.service_team_assignment_resources (
      id, service_id, assignment_id, resource_id, created_at
    )
    select gen_random_uuid(), p_target_service_id, new_assignment_id, source_link.resource_id, now()
    from public.service_team_assignment_resources source_link
    where source_link.service_id = p_source_service_id
      and source_link.assignment_id = source_assignment.id
    order by source_link.created_at, source_link.id;
  end loop;

  return jsonb_build_object(
    'source_service_id', p_source_service_id,
    'target_service_id', p_target_service_id,
    'people_copied', people_count,
    'assignments_copied', assignment_count,
    'resources_copied', resource_count
  );
end;
$$;

revoke all on function public.copy_service_team(smallint, smallint)
from public, anon, authenticated;
grant execute on function public.copy_service_team(smallint, smallint)
to authenticated;

-- Pre-apply verification (read-only):
-- select to_regprocedure('public.copy_service_team(smallint,smallint)') as existing_rpc;
-- select conname, pg_get_constraintdef(oid)
-- from pg_constraint
-- where conrelid in ('public.service_team_assignments'::regclass, 'public.service_team_assignment_resources'::regclass)
-- order by conrelid::regclass::text, conname;

-- Post-apply verification (read-only):
-- select to_regprocedure('public.copy_service_team(smallint,smallint)') as installed_rpc;
-- select routine_name, security_type
-- from information_schema.routines
-- where routine_schema = 'public' and routine_name = 'copy_service_team';
-- select grantee, privilege_type
-- from information_schema.routine_privileges
-- where routine_schema = 'public' and routine_name = 'copy_service_team'
-- order by grantee, privilege_type;

notify pgrst, 'reload schema';

commit;
