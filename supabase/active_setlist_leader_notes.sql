alter table public.active_setlist
add column if not exists leader_notes text null;

grant update (leader_notes)
on public.active_setlist
to authenticated;

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

grant execute on function public.prepare_next_service() to authenticated;
