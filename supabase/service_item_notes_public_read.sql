begin;

alter table public.service_item_notes enable row level security;

drop policy if exists "Authenticated can read service item notes" on public.service_item_notes;
drop policy if exists "Public can read service item notes" on public.service_item_notes;
create policy "Public can read service item notes"
on public.service_item_notes
for select
to public
using (true);

revoke insert, update, delete on public.service_item_notes from anon;
grant select on public.service_item_notes to anon, authenticated;

notify pgrst, 'reload schema';
commit;
