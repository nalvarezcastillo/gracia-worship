begin;

create table if not exists public.song_sections (
  id uuid primary key default gen_random_uuid(),
  song_key_id uuid not null references public.song_keys(id) on delete cascade,
  label text not null check (length(trim(label)) > 0),
  section_type text null check (section_type is null or section_type in ('intro','verse','chorus','bridge','prechorus','instrumental','outro','other')),
  start_seconds numeric(10,3) not null check (start_seconds >= 0),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (song_key_id, start_seconds)
);

create index if not exists song_sections_song_key_time_idx
on public.song_sections (song_key_id, start_seconds, sort_order);

alter table public.song_sections enable row level security;

drop policy if exists "Public can read song sections" on public.song_sections;
create policy "Public can read song sections" on public.song_sections for select to public using (true);

drop policy if exists "Authenticated can insert song sections" on public.song_sections;
create policy "Authenticated can insert song sections" on public.song_sections for insert to authenticated with check (true);

drop policy if exists "Authenticated can update song sections" on public.song_sections;
create policy "Authenticated can update song sections" on public.song_sections for update to authenticated using (true) with check (true);

drop policy if exists "Authenticated can delete song sections" on public.song_sections;
create policy "Authenticated can delete song sections" on public.song_sections for delete to authenticated using (true);

revoke all on public.song_sections
from public, anon, authenticated;

grant select on public.song_sections to anon, authenticated;
grant insert, update, delete on public.song_sections to authenticated;

notify pgrst, 'reload schema';
commit;
