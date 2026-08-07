alter table public.active_setlist drop constraint if exists active_setlist_id_check;
alter table public.active_setlist add column if not exists status text not null default 'archived';
update public.active_setlist set status = case when id = 1 then 'active' else 'archived' end;
alter table public.active_setlist drop constraint if exists active_setlist_status_check;
alter table public.active_setlist add constraint active_setlist_status_check check (status in ('active', 'archived'));
create unique index if not exists active_setlist_one_active_idx on public.active_setlist(status) where status = 'active';

alter table public.service_items add column if not exists service_id smallint;
update public.service_items set service_id = 1 where service_id is null;
alter table public.service_items alter column service_id set default 1, alter column service_id set not null;
alter table public.service_items drop constraint if exists service_items_service_id_fkey;
alter table public.service_items add constraint service_items_service_id_fkey foreign key (service_id) references public.active_setlist(id) on delete cascade;
create index if not exists service_items_service_id_position_idx on public.service_items(service_id, position);

drop policy if exists "Authenticated can insert services" on public.active_setlist;
create policy "Authenticated can insert services" on public.active_setlist for insert to authenticated with check (true);
drop policy if exists "Authenticated can update services" on public.active_setlist;
create policy "Authenticated can update services" on public.active_setlist for update to authenticated using (true) with check (true);
drop policy if exists "Authenticated can delete archived services" on public.active_setlist;
create policy "Authenticated can delete archived services" on public.active_setlist for delete to authenticated using (status = 'archived');
grant insert, delete on public.active_setlist to authenticated;
grant update (service_name, service_date, service_time, song_ids, leader_notes, updated_at, status) on public.active_setlist to authenticated;

create or replace function public.prepare_next_service()
returns smallint language plpgsql security invoker set search_path = public as $$
declare current_service public.active_setlist%rowtype; new_id smallint; next_date date; anchor_date date;
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
  insert into public.service_items (service_id, position, type, title, details, song_ids)
  select new_id, position, type, title, details, song_ids from public.service_items where service_id = current_service.id order by position;
  return new_id;
end; $$;

create or replace function public.restore_archived_service(target_service_id smallint)
returns void language plpgsql security invoker set search_path = public as $$
begin
  lock table public.active_setlist in share row exclusive mode;
  if not exists (select 1 from public.active_setlist where id = target_service_id and status = 'archived') then raise exception 'Archived service not found'; end if;
  update public.active_setlist set status = 'archived', updated_at = now() where status = 'active';
  update public.active_setlist set status = 'active', updated_at = now() where id = target_service_id;
end; $$;

grant execute on function public.prepare_next_service() to authenticated;
grant execute on function public.restore_archived_service(smallint) to authenticated;
