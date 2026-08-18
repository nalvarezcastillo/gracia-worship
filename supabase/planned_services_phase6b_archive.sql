begin;

create or replace function public.archive_completed_service(p_service_id smallint)
returns smallint
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
    raise exception 'Service is required';
  end if;

  -- Lifecycle mutations serialize on the Phase 6A global lock. A per-service
  -- lock is unnecessary because no Live row is mutated by this operation.
  perform pg_advisory_xact_lock(71830, 1);

  select status into target_status
  from public.active_setlist
  where id = p_service_id
  for update;

  if not found then
    raise exception 'Service not found';
  end if;
  if target_status <> 'completed' then
    raise exception 'Only a completed service can be archived';
  end if;
  if exists (
    select 1 from public.live_service_state
    where service_id = p_service_id and finished_at is null
  ) then
    raise exception 'Cannot archive a service with unfinished Live state';
  end if;
  if exists (
    select 1 from public.service_item_runs
    where service_id = p_service_id and ended_at is null
  ) then
    raise exception 'Cannot archive a service with an open run';
  end if;

  update public.active_setlist
  set status = 'archived', updated_at = now()
  where id = p_service_id;

  return p_service_id;
end;
$$;

revoke all on function public.archive_completed_service(smallint)
from public, anon;
grant execute on function public.archive_completed_service(smallint)
to authenticated;

notify pgrst, 'reload schema';

commit;
