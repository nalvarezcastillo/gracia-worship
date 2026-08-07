create table if not exists public.resource_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(trim(name)) > 0),
  sort_order integer not null unique check (sort_order >= 0),
  created_at timestamptz not null default now()
);

insert into public.resource_categories (name, sort_order)
values
  ('Audio', 0),
  ('IEM', 1),
  ('Instrumentos', 2),
  ('Video', 3),
  ('Producción', 4),
  ('Luces', 5),
  ('Otro', 6)
on conflict (name) do update set sort_order = excluded.sort_order;

create index if not exists resource_categories_sort_order_idx
on public.resource_categories(sort_order);

alter table public.resource_categories enable row level security;

drop policy if exists "Public can read resource categories" on public.resource_categories;
create policy "Public can read resource categories"
on public.resource_categories for select
to anon, authenticated
using (true);

revoke all on public.resource_categories from anon, authenticated;
grant select on public.resource_categories to anon, authenticated;

create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) > 0),
  category_id uuid not null references public.resource_categories(id) on update cascade on delete restrict,
  active boolean not null default true,
  notes text null,
  created_at timestamptz not null default now(),
  unique (category_id, name)
);

create index if not exists resources_category_active_name_idx
on public.resources(category_id, active, name);

create index if not exists resources_name_idx
on public.resources(name);

alter table public.resources enable row level security;

drop policy if exists "Public can read resources" on public.resources;
create policy "Public can read resources"
on public.resources for select
to anon, authenticated
using (true);

drop policy if exists "Authenticated can insert resources" on public.resources;
create policy "Authenticated can insert resources"
on public.resources for insert
to authenticated
with check (true);

drop policy if exists "Authenticated can update resources" on public.resources;
create policy "Authenticated can update resources"
on public.resources for update
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated can delete resources" on public.resources;
create policy "Authenticated can delete resources"
on public.resources for delete
to authenticated
using (true);

revoke all on public.resources from anon, authenticated;
grant select on public.resources to anon, authenticated;
grant insert, update, delete on public.resources to authenticated;
