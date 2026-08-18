begin;

create sequence if not exists public.active_setlist_id_seq
as smallint
minvalue 1
maxvalue 32767;

alter sequence public.active_setlist_id_seq
owned by public.active_setlist.id;

lock table public.active_setlist in share row exclusive mode;

select setval(
  'public.active_setlist_id_seq'::regclass,
  greatest(
    coalesce(service_max.max_id, sequence_state.last_value),
    sequence_state.last_value
  ),
  case when service_max.max_id is null then sequence_state.is_called else true end
)
from public.active_setlist_id_seq sequence_state
cross join (
  select max(service.id)::bigint as max_id
  from public.active_setlist service
) service_max;

alter table public.active_setlist
alter column id set default nextval('public.active_setlist_id_seq'::regclass);

drop policy if exists "Authenticated can delete archived services"
on public.active_setlist;

revoke delete on public.active_setlist from anon, authenticated;

create or replace function public.create_service_plan(
  p_service_name text,
  p_service_date date,
  p_service_time text
)
returns smallint
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  new_service_id smallint;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_service_name is null or btrim(p_service_name) = '' then
    raise exception 'Service name is required';
  end if;
  if p_service_date is null then
    raise exception 'Service date is required';
  end if;
  if p_service_time is null or p_service_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'Service time must use HH:MM in 24-hour format';
  end if;

  lock table public.active_setlist in share row exclusive mode;
  perform setval(
    'public.active_setlist_id_seq'::regclass,
    greatest(
      coalesce(service_max.max_id, sequence_state.last_value),
      sequence_state.last_value
    ),
    case when service_max.max_id is null then sequence_state.is_called else true end
  )
  from public.active_setlist_id_seq sequence_state
  cross join (
    select max(service.id)::bigint as max_id
    from public.active_setlist service
  ) service_max;

  insert into public.active_setlist (
    service_name,
    service_date,
    service_time,
    song_ids,
    leader_notes,
    status,
    updated_at
  ) values (
    btrim(p_service_name),
    p_service_date,
    p_service_time,
    '{}'::uuid[],
    null,
    'planned',
    now()
  )
  returning id into new_service_id;

  return new_service_id;
end;
$$;

create or replace function public.duplicate_service_plan(
  p_source_service_id smallint,
  p_service_name text,
  p_service_date date,
  p_service_time text,
  p_copy_order boolean default true,
  p_copy_team boolean default false
)
returns smallint
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  new_service_id smallint;
  new_assignment_id uuid;
  source_assignment record;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_source_service_id is null then
    raise exception 'Source service is required';
  end if;
  if p_service_name is null or btrim(p_service_name) = '' then
    raise exception 'Service name is required';
  end if;
  if p_service_date is null then
    raise exception 'Service date is required';
  end if;
  if p_service_time is null or p_service_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'Service time must use HH:MM in 24-hour format';
  end if;

  lock table public.active_setlist in share row exclusive mode;
  if not exists (
    select 1 from public.active_setlist source_service
    where source_service.id = p_source_service_id
  ) then
    raise exception 'Source service not found';
  end if;

  perform setval(
    'public.active_setlist_id_seq'::regclass,
    greatest(
      coalesce(service_max.max_id, sequence_state.last_value),
      sequence_state.last_value
    ),
    case when service_max.max_id is null then sequence_state.is_called else true end
  )
  from public.active_setlist_id_seq sequence_state
  cross join (
    select max(service.id)::bigint as max_id
    from public.active_setlist service
  ) service_max;

  insert into public.active_setlist (
    service_name,
    service_date,
    service_time,
    song_ids,
    leader_notes,
    status,
    updated_at
  ) values (
    btrim(p_service_name),
    p_service_date,
    p_service_time,
    '{}'::uuid[],
    null,
    'planned',
    now()
  )
  returning id into new_service_id;

  if coalesce(p_copy_order, true) then
    insert into public.service_items (
      id,
      service_id,
      position,
      type,
      title,
      details,
      planned_duration_seconds,
      song_ids,
      song_id,
      created_at
    )
    select
      gen_random_uuid(),
      new_service_id,
      source_item.position,
      source_item.type,
      source_item.title,
      source_item.details,
      source_item.planned_duration_seconds,
      source_item.song_ids,
      source_item.song_id,
      now()
    from public.service_items source_item
    where source_item.service_id = p_source_service_id
    order by source_item.position, source_item.created_at, source_item.id;
  end if;

  if coalesce(p_copy_team, false) then
    for source_assignment in
      select assignment.*
      from public.service_team_assignments assignment
      where assignment.service_id = p_source_service_id
      order by assignment.sort_order, assignment.created_at, assignment.id
    loop
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
      ) values (
        gen_random_uuid(),
        new_service_id,
        source_assignment.team_member_id,
        source_assignment.person_name,
        source_assignment.role_name,
        source_assignment.microphone_name,
        source_assignment.sort_order,
        now(),
        now()
      )
      returning id into new_assignment_id;

      insert into public.service_team_assignment_resources (
        id,
        service_id,
        assignment_id,
        resource_id,
        created_at
      )
      select
        gen_random_uuid(),
        new_service_id,
        new_assignment_id,
        source_link.resource_id,
        now()
      from public.service_team_assignment_resources source_link
      where source_link.service_id = p_source_service_id
        and source_link.assignment_id = source_assignment.id
      order by source_link.created_at, source_link.id;
    end loop;
  end if;

  return new_service_id;
end;
$$;

create or replace function public.delete_planned_service(p_service_id smallint)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_status text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_service_id is null then
    raise exception 'Service ID is required';
  end if;

  perform pg_advisory_xact_lock(71831, p_service_id::integer);

  select service.status into target_status
  from public.active_setlist service
  where service.id = p_service_id
  for update;

  if not found then
    raise exception 'Service not found';
  end if;
  if target_status <> 'planned' then
    raise exception 'Only planned services can be deleted';
  end if;
  if exists (
    select 1 from public.live_service_state live_state
    where live_state.service_id = p_service_id
  ) then
    raise exception 'Cannot delete a service with Live history';
  end if;
  if exists (
    select 1 from public.service_item_runs service_run
    where service_run.service_id = p_service_id
  ) then
    raise exception 'Cannot delete a service with run history';
  end if;

  delete from public.active_setlist service
  where service.id = p_service_id;
end;
$$;

revoke all on function public.create_service_plan(text, date, text)
from public, anon, authenticated;
grant execute on function public.create_service_plan(text, date, text)
to authenticated;

revoke all on function public.duplicate_service_plan(smallint, text, date, text, boolean, boolean)
from public, anon, authenticated;
grant execute on function public.duplicate_service_plan(smallint, text, date, text, boolean, boolean)
to authenticated;

revoke all on function public.delete_planned_service(smallint)
from public, anon, authenticated;
grant execute on function public.delete_planned_service(smallint)
to authenticated;

notify pgrst, 'reload schema';

commit;
