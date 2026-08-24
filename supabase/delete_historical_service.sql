-- PRE-APPLY VERIFICATION (run manually before applying this migration):
-- select to_regprocedure('public.delete_historical_service(smallint)') as existing_function;
-- select has_table_privilege('authenticated', 'public.active_setlist', 'delete') as authenticated_can_delete_directly;
-- select status, count(*) from public.active_setlist group by status order by status;
-- select count(*) as open_service_runs from public.service_item_runs where ended_at is null;

create or replace function public.delete_historical_service(p_service_id smallint)
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
  if p_service_id is null or p_service_id < 1 then
    raise exception 'Se requiere un servicio válido.';
  end if;

  perform pg_advisory_xact_lock(71831, p_service_id::integer);

  select service.status
  into target_status
  from public.active_setlist service
  where service.id = p_service_id
  for update;

  if not found then
    raise exception 'No se encontró el servicio.';
  end if;
  if target_status not in ('completed', 'archived') then
    raise exception 'Solo se pueden eliminar servicios completados o archivados.';
  end if;
  if exists (
    select 1
    from public.service_item_runs service_run
    where service_run.service_id = p_service_id
      and service_run.ended_at is null
  ) then
    raise exception 'No se puede eliminar un servicio mientras está En Vivo.';
  end if;

  delete from public.active_setlist service
  where service.id = p_service_id;
end;
$$;

revoke all on function public.delete_historical_service(smallint)
from public, anon, authenticated;
grant execute on function public.delete_historical_service(smallint)
to authenticated;

-- POST-APPLY VERIFICATION (run manually after applying this migration):
-- select to_regprocedure('public.delete_historical_service(smallint)') as installed_function;
-- select has_function_privilege('anon', 'public.delete_historical_service(smallint)', 'execute') as anon_can_execute,
--        has_function_privilege('authenticated', 'public.delete_historical_service(smallint)', 'execute') as authenticated_can_execute;
-- select has_table_privilege('authenticated', 'public.active_setlist', 'delete') as authenticated_can_delete_directly;
-- select prosecdef, proconfig
-- from pg_proc
-- where oid = 'public.delete_historical_service(smallint)'::regprocedure;
