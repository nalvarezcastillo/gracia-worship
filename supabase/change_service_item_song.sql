begin;

create or replace function public.change_service_item_song(
  p_service_id smallint,
  p_service_item_id uuid,
  p_song_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_status text;
  target_item public.service_items%rowtype;
  replacement_title text;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para cambiar una canción.';
  end if;
  if p_service_id is null or p_service_item_id is null or p_song_id is null then
    raise exception 'El servicio, el elemento y la canción son obligatorios.';
  end if;

  perform pg_advisory_xact_lock(71831, p_service_id::integer);

  select service.status into target_status
  from public.active_setlist service
  where service.id = p_service_id
  for update;
  if not found then
    raise exception 'No se encontró el servicio.';
  end if;
  if target_status not in ('planned', 'active') then
    raise exception 'Solo se pueden cambiar canciones de servicios planificados o activos.';
  end if;

  select item.* into target_item
  from public.service_items item
  where item.service_id = p_service_id
    and item.id = p_service_item_id
  for update;
  if not found then
    raise exception 'El elemento no pertenece a este servicio.';
  end if;
  if target_item.type <> 'song' then
    raise exception 'Solo se pueden cambiar elementos de tipo canción.';
  end if;

  select song.title into replacement_title
  from public.songs song
  where song.id = p_song_id;
  if not found then
    raise exception 'No se encontró la canción seleccionada.';
  end if;

  if target_item.song_id = p_song_id then
    return;
  end if;

  if exists (
    select 1 from public.service_item_runs service_run
    where service_run.service_id = p_service_id
      and service_run.service_item_id = p_service_item_id
  ) then
    raise exception 'No se puede cambiar una canción que ya participó en En Vivo.';
  end if;
  if exists (
    select 1 from public.live_service_state live_state
    where live_state.service_id = p_service_id
      and live_state.current_item_id = p_service_item_id
  ) then
    raise exception 'No se puede cambiar la canción que está seleccionada en En Vivo.';
  end if;

  delete from public.service_song_settings setting
  where setting.service_id = p_service_id
    and setting.service_item_id = p_service_item_id;

  update public.service_items
  set song_id = p_song_id,
      title = replacement_title,
      planned_duration_seconds = null
  where service_id = p_service_id
    and id = p_service_item_id;
end;
$$;

revoke all on function public.change_service_item_song(smallint, uuid, uuid)
from public, anon, authenticated;
grant execute on function public.change_service_item_song(smallint, uuid, uuid)
to authenticated;

notify pgrst, 'reload schema';

commit;
