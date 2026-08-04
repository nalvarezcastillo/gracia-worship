alter table public.active_setlist
add column if not exists service_date date null;

grant update (service_name, service_date, service_time, song_ids, updated_at)
on public.active_setlist
to authenticated;
