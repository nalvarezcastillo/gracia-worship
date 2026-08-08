-- Patch for databases where public.service_items.song_ids is text[].
-- Each array element may be a plain song UUID or a serialized JSON object.

create or replace function public.parse_service_song_entry(p_entry text)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_entry is null or btrim(p_entry) = '' then
    return null;
  end if;

  return p_entry::jsonb;
exception
  when others then
    return null;
end;
$$;

revoke all on function public.parse_service_song_entry(text)
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
  where id = new.current_item_id
    and service_id = new.service_id;

  if not found then
    raise exception 'The live item does not belong to the selected service';
  end if;

  if new.current_song_id is not null then
    if target_item.type <> 'worship' or not exists (
      select 1
      from unnest(coalesce(target_item.song_ids, array[]::text[])) as songs(raw_entry)
      cross join lateral (
        select public.parse_service_song_entry(songs.raw_entry) as parsed_entry
      ) as parsed
      where coalesce(
        case
          when btrim(songs.raw_entry) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            then btrim(songs.raw_entry)
          else null
        end,
        case jsonb_typeof(parsed.parsed_entry)
          when 'string' then parsed.parsed_entry #>> '{}'
          when 'object' then coalesce(
            parsed.parsed_entry ->> 'songId',
            parsed.parsed_entry ->> 'song_id',
            parsed.parsed_entry ->> 'id'
          )
          else null
        end
      ) = new.current_song_id::text
    ) then
      raise exception 'The live song does not belong to the selected worship block';
    end if;
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
  where id = p_item_id
    and service_id = p_service_id;

  if not found then
    raise exception 'The item does not belong to the selected service';
  end if;

  if p_song_id is null then
    return target_item.planned_duration_seconds;
  end if;

  if target_item.type <> 'worship' then
    raise exception 'A song can only be selected inside a worship block';
  end if;

  select parsed.parsed_entry into parsed_song_entry
  from unnest(coalesce(target_item.song_ids, array[]::text[])) as songs(raw_entry)
  cross join lateral (
    select public.parse_service_song_entry(songs.raw_entry) as parsed_entry
  ) as parsed
  where coalesce(
    case
      when btrim(songs.raw_entry) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then btrim(songs.raw_entry)
      else null
    end,
    case jsonb_typeof(parsed.parsed_entry)
      when 'string' then parsed.parsed_entry #>> '{}'
      when 'object' then coalesce(
        parsed.parsed_entry ->> 'songId',
        parsed.parsed_entry ->> 'song_id',
        parsed.parsed_entry ->> 'id'
      )
      else null
    end
  ) = p_song_id::text
  limit 1;

  if not found then
    raise exception 'The song does not belong to the selected worship block';
  end if;

  if jsonb_typeof(parsed_song_entry) = 'object' then
    raw_seconds := coalesce(
      parsed_song_entry ->> 'plannedDurationSeconds',
      parsed_song_entry ->> 'planned_duration_seconds'
    );
    if raw_seconds ~ '^[1-9][0-9]*$' then
      return raw_seconds::integer;
    end if;

    raw_minutes := coalesce(
      parsed_song_entry ->> 'plannedDurationMinutes',
      parsed_song_entry ->> 'planned_duration_minutes'
    );
    if raw_minutes ~ '^[1-9][0-9]*$' then
      return raw_minutes::integer * 60;
    end if;
  end if;

  select duration into library_duration
  from public.songs
  where id = p_song_id;

  if not found then
    raise exception 'Song not found';
  end if;

  if trim(library_duration) ~ '^[0-9]+:[0-5][0-9]$' then
    return split_part(trim(library_duration), ':', 1)::integer * 60
      + split_part(trim(library_duration), ':', 2)::integer;
  end if;

  return null;
end;
$$;

revoke all on function public.resolve_service_run_planned_seconds(smallint, uuid, uuid)
from public, anon, authenticated;
