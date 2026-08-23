begin;

create table public.service_playback_stem_settings (
  service_id smallint not null,
  service_item_id uuid not null,
  song_id uuid not null references public.songs(id) on delete restrict,
  stem_id uuid not null references public.song_stems(id) on delete cascade,
  volume numeric(5,4) not null,
  muted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_playback_stem_settings_pkey primary key (service_item_id, song_id, stem_id),
  constraint service_playback_stem_settings_item_fkey foreign key (service_id, service_item_id)
    references public.service_items(service_id, id) on delete cascade,
  constraint service_playback_stem_settings_volume_check check (volume >= 0 and volume <= 1)
);

create index service_playback_stem_settings_service_occurrence_idx
on public.service_playback_stem_settings(service_id, service_item_id, song_id);

alter table public.service_playback_stem_settings enable row level security;
create policy "Public can read service playback stem settings"
on public.service_playback_stem_settings for select to public using (true);
revoke all on public.service_playback_stem_settings from public, anon, authenticated;
grant select on public.service_playback_stem_settings to anon, authenticated;

create or replace function public.set_service_playback_stem_setting(
  p_service_id smallint,
  p_service_item_id uuid,
  p_song_id uuid,
  p_stem_id uuid,
  p_volume numeric,
  p_muted boolean
)
returns void language plpgsql security definer
set search_path = pg_catalog, public as $$
declare target_status text; target_item public.service_items%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_service_id is null or p_service_item_id is null or p_song_id is null or p_stem_id is null then
    raise exception 'Service, service item, song, and stem are required';
  end if;
  if p_volume is null or p_volume < 0 or p_volume > 1 then raise exception 'Volume must be between 0 and 1'; end if;
  if p_muted is null then raise exception 'Muted is required'; end if;

  perform pg_advisory_xact_lock(71832, p_service_id::integer);
  select service.status into target_status from public.active_setlist service
  where service.id = p_service_id for update;
  if not found then raise exception 'Service not found'; end if;
  if target_status not in ('active', 'planned') then raise exception 'Only active or planned services can be edited'; end if;

  select item.* into target_item from public.service_items item
  where item.service_id = p_service_id and item.id = p_service_item_id for update;
  if not found then raise exception 'Service item not found in service'; end if;
  if not (
    (target_item.type = 'song' and target_item.song_id = p_song_id)
    or (target_item.type = 'worship' and exists (
      select 1 from unnest(coalesce(target_item.song_ids, '{}'::text[])) stored(value)
      where stored.value = p_song_id::text
         or stored.value ~ ('"(songId|song_id|id)"[[:space:]]*:[[:space:]]*"' || p_song_id::text || '"')
    ))
  ) then raise exception 'Song does not belong to this service occurrence'; end if;
  if not exists (
    select 1 from public.song_stems stem
    join public.song_keys song_key on song_key.id = stem.song_key_id
    where stem.id = p_stem_id and song_key.song_id = p_song_id
  ) then raise exception 'Stem does not belong to song'; end if;

  insert into public.service_playback_stem_settings(service_id, service_item_id, song_id, stem_id, volume, muted)
  values (p_service_id, p_service_item_id, p_song_id, p_stem_id, p_volume, p_muted)
  on conflict (service_item_id, song_id, stem_id) do update
  set volume = excluded.volume, muted = excluded.muted, updated_at = now();
end; $$;

revoke all on function public.set_service_playback_stem_setting(smallint, uuid, uuid, uuid, numeric, boolean)
from public, anon, authenticated;
grant execute on function public.set_service_playback_stem_setting(smallint, uuid, uuid, uuid, numeric, boolean)
to authenticated;

create or replace function public.prepare_next_service()
returns smallint language plpgsql security definer set search_path = pg_catalog, public as $$
declare current_service public.active_setlist%rowtype; new_id smallint; new_item_id uuid; next_date date; anchor_date date; source_item record;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  lock table public.active_setlist in share row exclusive mode;
  select * into current_service from public.active_setlist where status = 'active' for update;
  if not found then raise exception 'Active service not found'; end if;
  anchor_date := coalesce(current_service.service_date, current_date);
  next_date := anchor_date + case when (6 - extract(dow from anchor_date)::integer + 7) % 7 = 0 then 7 else (6 - extract(dow from anchor_date)::integer + 7) % 7 end;
  select (coalesce(max(id), 0) + 1)::smallint into new_id from public.active_setlist;
  update public.active_setlist set status = 'archived', updated_at = now() where id = current_service.id;
  insert into public.active_setlist(id, service_name, service_date, service_time, song_ids, leader_notes, status, updated_at)
  values (new_id, current_service.service_name, next_date, current_service.service_time, current_service.song_ids, null, 'active', now());
  for source_item in select * from public.service_items where service_id = current_service.id order by position, created_at, id loop
    new_item_id := gen_random_uuid();
    insert into public.service_items(id, service_id, position, type, title, details, planned_duration_seconds, song_ids, song_id)
    values (new_item_id, new_id, source_item.position, source_item.type, source_item.title, source_item.details, source_item.planned_duration_seconds, source_item.song_ids, source_item.song_id);
    insert into public.service_song_settings(service_id, service_item_id, song_id, key_override)
    select new_id, new_item_id, song_id, key_override from public.service_song_settings where service_id = current_service.id and service_item_id = source_item.id;
    insert into public.service_item_notes(service_id, service_item_id, notes)
    select new_id, new_item_id, notes from public.service_item_notes where service_id = current_service.id and service_item_id = source_item.id;
    insert into public.service_playback_stem_settings(service_id, service_item_id, song_id, stem_id, volume, muted)
    select new_id, new_item_id, song_id, stem_id, volume, muted from public.service_playback_stem_settings
    where service_id = current_service.id and service_item_id = source_item.id;
  end loop;
  return new_id;
end; $$;

create or replace function public.duplicate_service_plan(
  p_source_service_id smallint, p_service_name text, p_service_date date, p_service_time text,
  p_copy_order boolean default true, p_copy_team boolean default false
)
returns smallint language plpgsql security definer set search_path = pg_catalog, public as $$
declare new_service_id smallint; new_assignment_id uuid; new_item_id uuid; source_assignment record; source_item record;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_source_service_id is null then raise exception 'Source service is required'; end if;
  if p_service_name is null or btrim(p_service_name) = '' then raise exception 'Service name is required'; end if;
  if p_service_date is null then raise exception 'Service date is required'; end if;
  if p_service_time is null or p_service_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Service time must use HH:MM in 24-hour format'; end if;
  lock table public.active_setlist in share row exclusive mode;
  if not exists (select 1 from public.active_setlist where id = p_source_service_id) then raise exception 'Source service not found'; end if;
  perform setval('public.active_setlist_id_seq'::regclass, greatest(coalesce(service_max.max_id, sequence_state.last_value), sequence_state.last_value), case when service_max.max_id is null then sequence_state.is_called else true end)
  from public.active_setlist_id_seq sequence_state cross join (select max(id)::bigint max_id from public.active_setlist) service_max;
  insert into public.active_setlist(service_name, service_date, service_time, song_ids, leader_notes, status, updated_at)
  values (btrim(p_service_name), p_service_date, p_service_time, '{}'::uuid[], null, 'planned', now()) returning id into new_service_id;
  if coalesce(p_copy_order, true) then
    for source_item in select * from public.service_items where service_id = p_source_service_id order by position, created_at, id loop
      new_item_id := gen_random_uuid();
      insert into public.service_items(id, service_id, position, type, title, details, planned_duration_seconds, song_ids, song_id, created_at)
      values (new_item_id, new_service_id, source_item.position, source_item.type, source_item.title, source_item.details, source_item.planned_duration_seconds, source_item.song_ids, source_item.song_id, now());
      insert into public.service_song_settings(service_id, service_item_id, song_id, key_override)
      select new_service_id, new_item_id, song_id, key_override from public.service_song_settings where service_id = p_source_service_id and service_item_id = source_item.id;
      insert into public.service_item_notes(service_id, service_item_id, notes)
      select new_service_id, new_item_id, notes from public.service_item_notes where service_id = p_source_service_id and service_item_id = source_item.id;
      insert into public.service_playback_stem_settings(service_id, service_item_id, song_id, stem_id, volume, muted)
      select new_service_id, new_item_id, song_id, stem_id, volume, muted from public.service_playback_stem_settings
      where service_id = p_source_service_id and service_item_id = source_item.id;
    end loop;
  end if;
  if coalesce(p_copy_team, false) then
    for source_assignment in select * from public.service_team_assignments where service_id = p_source_service_id order by sort_order, created_at, id loop
      insert into public.service_team_assignments(id, service_id, team_member_id, person_name, role_name, microphone_name, sort_order, created_at, updated_at)
      values (gen_random_uuid(), new_service_id, source_assignment.team_member_id, source_assignment.person_name, source_assignment.role_name, source_assignment.microphone_name, source_assignment.sort_order, now(), now()) returning id into new_assignment_id;
      insert into public.service_team_assignment_resources(id, service_id, assignment_id, resource_id, created_at)
      select gen_random_uuid(), new_service_id, new_assignment_id, resource_id, now() from public.service_team_assignment_resources
      where service_id = p_source_service_id and assignment_id = source_assignment.id order by created_at, id;
    end loop;
  end if;
  return new_service_id;
end; $$;

notify pgrst, 'reload schema';
commit;
