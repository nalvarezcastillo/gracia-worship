create table if not exists public.song_keys (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.songs(id) on delete cascade,
  key_name text not null,
  audio_url text null,
  sheet_url text null,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  unique (song_id, key_name)
);

create index if not exists song_keys_song_id_idx
on public.song_keys (song_id);

alter table public.song_keys enable row level security;

drop policy if exists "Public can read song keys" on public.song_keys;
create policy "Public can read song keys"
on public.song_keys
for select
to public
using (true);

drop policy if exists "Authenticated can insert song keys" on public.song_keys;
create policy "Authenticated can insert song keys"
on public.song_keys
for insert
to authenticated
with check (true);

drop policy if exists "Authenticated can update song keys" on public.song_keys;
create policy "Authenticated can update song keys"
on public.song_keys
for update
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated can delete song keys" on public.song_keys;
create policy "Authenticated can delete song keys"
on public.song_keys
for delete
to authenticated
using (true);

revoke insert, update, delete on public.song_keys from anon;
grant select on public.song_keys to anon, authenticated;
grant insert, update, delete on public.song_keys to authenticated;

insert into public.song_keys (song_id, key_name, audio_url, sheet_url, sort_order)
select
  id,
  coalesce(nullif(trim(key), ''), 'Default'),
  nullif(audio_url, ''),
  nullif(sheet_url, ''),
  0
from public.songs
on conflict (song_id, key_name) do nothing;
