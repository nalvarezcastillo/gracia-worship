begin;

alter table public.service_items
add column if not exists song_id uuid null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.service_items'::regclass
      and conname = 'service_items_song_id_fkey'
  ) then
    alter table public.service_items
      add constraint service_items_song_id_fkey
      foreign key (song_id) references public.songs(id) on delete restrict;
  end if;
end;
$$;

alter table public.service_items
drop constraint if exists service_items_type_check;

alter table public.service_items
add constraint service_items_type_check
check (type in ('text', 'worship', 'song'));

alter table public.service_items
drop constraint if exists service_items_song_shape_check;

-- NOT VALID preserves any pre-existing noncanonical legacy rows while enforcing
-- the shape for every new or updated row. It can be validated separately after
-- production data has been audited.
alter table public.service_items
add constraint service_items_song_shape_check
check (
  (type = 'song' and song_id is not null and song_ids is null)
  or (type = 'worship' and song_id is null)
  or (type = 'text' and song_id is null and song_ids is null)
) not valid;

create index if not exists service_items_song_id_idx
on public.service_items(song_id)
where song_id is not null;

create or replace function public.resolve_first_live_service_entry(p_service_id smallint)
returns table(item_id uuid, song_id uuid)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  target_item public.service_items%rowtype;
  target_song_id uuid;
begin
  for target_item in
    select * from public.service_items
    where service_id = p_service_id
    order by position, created_at, id
  loop
    if target_item.type = 'song' then
      if target_item.song_id is not null then
        item_id := target_item.id;
        song_id := target_item.song_id;
        return next;
        return;
      end if;
    elsif target_item.type <> 'worship' then
      item_id := target_item.id;
      song_id := null;
      return next;
      return;
    else
      select candidate.song_id::uuid into target_song_id
      from unnest(coalesce(target_item.song_ids, array[]::text[])) with ordinality as songs(raw_entry, song_order)
      cross join lateral (select public.parse_service_song_entry(songs.raw_entry) as parsed_entry) as parsed
      cross join lateral (select coalesce(
        case when btrim(songs.raw_entry) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then btrim(songs.raw_entry) else null end,
        case jsonb_typeof(parsed.parsed_entry) when 'string' then parsed.parsed_entry #>> '{}' when 'object' then coalesce(parsed.parsed_entry ->> 'songId', parsed.parsed_entry ->> 'song_id', parsed.parsed_entry ->> 'id') else null end
      ) as song_id) as candidate
      where candidate.song_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      order by songs.song_order
      limit 1;
      if found then
        item_id := target_item.id;
        song_id := target_song_id;
        return next;
        return;
      end if;
    end if;
  end loop;
end;
$$;

revoke all on function public.resolve_first_live_service_entry(smallint)
from public, anon, authenticated;

create or replace function public.validate_live_service_state()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  target_item public.service_items%rowtype;
begin
  select * into target_item
  from public.service_items
  where id = new.current_item_id and service_id = new.service_id;

  if not found then
    raise exception 'The live item does not belong to the selected service';
  end if;

  if target_item.type = 'song' then
    if new.current_song_id is null or new.current_song_id is distinct from target_item.song_id then
      raise exception 'The live song does not match the selected song item';
    end if;
  elsif target_item.type = 'worship' then
    if new.current_song_id is null or not exists (
      select 1
      from unnest(coalesce(target_item.song_ids, array[]::text[])) as songs(raw_entry)
      cross join lateral (select public.parse_service_song_entry(songs.raw_entry) as parsed_entry) as parsed
      where coalesce(
        case when btrim(songs.raw_entry) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then btrim(songs.raw_entry) else null end,
        case jsonb_typeof(parsed.parsed_entry) when 'string' then parsed.parsed_entry #>> '{}' when 'object' then coalesce(parsed.parsed_entry ->> 'songId', parsed.parsed_entry ->> 'song_id', parsed.parsed_entry ->> 'id') else null end
      ) = new.current_song_id::text
    ) then
      raise exception 'The live song does not belong to the selected worship block';
    end if;
  elsif new.current_song_id is not null then
    raise exception 'A non-song service item cannot select a song';
  end if;

  if tg_op = 'INSERT' then
    new.started_at := now();
  elsif old.current_item_id is distinct from new.current_item_id
    or old.current_song_id is distinct from new.current_song_id then
    new.started_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.resolve_service_run_planned_seconds(
  p_service_id smallint,
  p_item_id uuid,
  p_song_id uuid default null
)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  target_item public.service_items%rowtype;
  parsed_song_entry jsonb;
  raw_seconds text;
  raw_minutes text;
  library_duration text;
begin
  select * into target_item
  from public.service_items
  where id = p_item_id and service_id = p_service_id;

  if not found then
    raise exception 'The item does not belong to the selected service';
  end if;

  if target_item.type = 'song' then
    if p_song_id is null or p_song_id is distinct from target_item.song_id then
      raise exception 'The run song does not match the selected song item';
    end if;
    if target_item.planned_duration_seconds is not null then
      return target_item.planned_duration_seconds;
    end if;
    select duration into library_duration from public.songs where id = target_item.song_id;
    if not found then raise exception 'Song not found'; end if;
    if trim(library_duration) ~ '^[0-9]+:[0-5][0-9]$' then
      return split_part(trim(library_duration), ':', 1)::integer * 60
        + split_part(trim(library_duration), ':', 2)::integer;
    end if;
    return null;
  end if;

  if target_item.type <> 'worship' then
    if p_song_id is not null then raise exception 'A non-song service item cannot select a song'; end if;
    return target_item.planned_duration_seconds;
  end if;

  if p_song_id is null then raise exception 'A worship block requires a song'; end if;

  select parsed.parsed_entry into parsed_song_entry
  from unnest(coalesce(target_item.song_ids, array[]::text[])) as songs(raw_entry)
  cross join lateral (select public.parse_service_song_entry(songs.raw_entry) as parsed_entry) as parsed
  where coalesce(
    case when btrim(songs.raw_entry) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then btrim(songs.raw_entry) else null end,
    case jsonb_typeof(parsed.parsed_entry) when 'string' then parsed.parsed_entry #>> '{}' when 'object' then coalesce(parsed.parsed_entry ->> 'songId', parsed.parsed_entry ->> 'song_id', parsed.parsed_entry ->> 'id') else null end
  ) = p_song_id::text
  limit 1;

  if not found then raise exception 'The song does not belong to the selected worship block'; end if;

  if jsonb_typeof(parsed_song_entry) = 'object' then
    raw_seconds := coalesce(parsed_song_entry ->> 'plannedDurationSeconds', parsed_song_entry ->> 'planned_duration_seconds');
    if raw_seconds ~ '^[1-9][0-9]*$' then return raw_seconds::integer; end if;
    raw_minutes := coalesce(parsed_song_entry ->> 'plannedDurationMinutes', parsed_song_entry ->> 'planned_duration_minutes');
    if raw_minutes ~ '^[1-9][0-9]*$' then return raw_minutes::integer * 60; end if;
  end if;

  select duration into library_duration from public.songs where id = p_song_id;
  if not found then raise exception 'Song not found'; end if;
  if trim(library_duration) ~ '^[0-9]+:[0-5][0-9]$' then
    return split_part(trim(library_duration), ':', 1)::integer * 60
      + split_part(trim(library_duration), ':', 2)::integer;
  end if;
  return null;
end;
$$;

revoke all on function public.resolve_service_run_planned_seconds(smallint, uuid, uuid)
from public, anon, authenticated;

create or replace function public.prepare_next_service()
returns smallint
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_service public.active_setlist%rowtype;
  new_id smallint;
  next_date date;
  anchor_date date;
begin
  lock table public.active_setlist in share row exclusive mode;
  select * into current_service from public.active_setlist where status = 'active' for update;
  if not found then raise exception 'Active service not found'; end if;
  anchor_date := coalesce(current_service.service_date, current_date);
  next_date := anchor_date + case when (6 - extract(dow from anchor_date)::integer + 7) % 7 = 0 then 7 else (6 - extract(dow from anchor_date)::integer + 7) % 7 end;
  select (coalesce(max(id), 0) + 1)::smallint into new_id from public.active_setlist;
  update public.active_setlist set status = 'archived', updated_at = now() where id = current_service.id;
  insert into public.active_setlist (id, service_name, service_date, service_time, song_ids, leader_notes, status, updated_at)
  values (new_id, current_service.service_name, next_date, current_service.service_time, current_service.song_ids, null, 'active', now());
  insert into public.service_items (service_id, position, type, title, details, planned_duration_seconds, song_ids, song_id)
  select new_id, position, type, title, details, planned_duration_seconds, song_ids, song_id
  from public.service_items where service_id = current_service.id order by position;
  return new_id;
end;
$$;

grant execute on function public.prepare_next_service() to authenticated;

notify pgrst, 'reload schema';

commit;
