begin;

alter table public.active_setlist
alter column service_time set default '19:00';

alter table public.active_setlist
drop constraint if exists active_setlist_status_check;

alter table public.active_setlist
add constraint active_setlist_status_check
check (status in ('active', 'planned', 'completed', 'archived'));

create index if not exists active_setlist_hub_status_schedule_idx
on public.active_setlist(status, service_date, service_time, id);

notify pgrst, 'reload schema';

commit;
