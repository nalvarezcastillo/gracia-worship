create table if not exists public.app_settings (
  id smallint primary key default 1 check (id = 1),
  church_name text not null default 'Silverdale Gracia',
  ministry_name text not null default 'Gracia Worship',
  logo_url text null,
  service_day text not null default 'Sábado',
  service_time text not null default '7:00 PM',
  updated_at timestamptz not null default now()
);

insert into public.app_settings (id)
values (1)
on conflict (id) do nothing;

alter table public.app_settings enable row level security;

drop policy if exists "Public can read app settings" on public.app_settings;
create policy "Public can read app settings"
on public.app_settings for select to anon, authenticated
using (id = 1);

drop policy if exists "Authenticated can update app settings" on public.app_settings;
create policy "Authenticated can update app settings"
on public.app_settings for update to authenticated
using (id = 1)
with check (id = 1);

revoke all on public.app_settings from anon, authenticated;
grant select on public.app_settings to anon, authenticated;
grant update (church_name, ministry_name, logo_url, service_day, service_time, updated_at)
on public.app_settings to authenticated;
