begin;

create table if not exists public.service_item_notes (
  service_id smallint not null,
  service_item_id uuid primary key,
  notes text not null check (btrim(notes) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_item_notes_item_fkey foreign key (service_id, service_item_id)
    references public.service_items(service_id, id) on delete cascade
);
create index if not exists service_item_notes_service_id_idx on public.service_item_notes(service_id);
alter table public.service_item_notes enable row level security;
drop policy if exists "Authenticated can read service item notes" on public.service_item_notes;
create policy "Authenticated can read service item notes" on public.service_item_notes for select to authenticated using (true);
drop policy if exists "Authenticated can insert editable service item notes" on public.service_item_notes;
create policy "Authenticated can insert editable service item notes" on public.service_item_notes for insert to authenticated with check (exists (select 1 from public.active_setlist service where service.id = service_item_notes.service_id and service.status in ('active', 'planned')));
drop policy if exists "Authenticated can update editable service item notes" on public.service_item_notes;
create policy "Authenticated can update editable service item notes" on public.service_item_notes for update to authenticated using (exists (select 1 from public.active_setlist service where service.id = service_item_notes.service_id and service.status in ('active', 'planned'))) with check (exists (select 1 from public.active_setlist service where service.id = service_item_notes.service_id and service.status in ('active', 'planned')));
drop policy if exists "Authenticated can delete editable service item notes" on public.service_item_notes;
create policy "Authenticated can delete editable service item notes" on public.service_item_notes for delete to authenticated using (exists (select 1 from public.active_setlist service where service.id = service_item_notes.service_id and service.status in ('active', 'planned')));
revoke all on public.service_item_notes from public, anon, authenticated;
grant select, insert, update, delete on public.service_item_notes to authenticated;

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
      select new_service_id, new_item_id, setting.song_id, setting.key_override from public.service_song_settings setting
      where setting.service_id = p_source_service_id and setting.service_item_id = source_item.id;
      insert into public.service_item_notes(service_id, service_item_id, notes)
      select new_service_id, new_item_id, note.notes from public.service_item_notes note
      where note.service_id = p_source_service_id and note.service_item_id = source_item.id;
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
    select new_id, new_item_id, song_id, key_override from public.service_song_settings
    where service_id = current_service.id and service_item_id = source_item.id;
    insert into public.service_item_notes(service_id, service_item_id, notes)
    select new_id, new_item_id, notes from public.service_item_notes
    where service_id = current_service.id and service_item_id = source_item.id;
  end loop;
  return new_id;
end; $$;

notify pgrst, 'reload schema';
commit;
