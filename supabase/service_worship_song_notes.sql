begin;

alter table public.service_items
rename column song_ids to song_ids_legacy;

alter table public.service_items
add column song_ids jsonb null;

update public.service_items
set song_ids = case
  when song_ids_legacy is null then null
  else (
    select coalesce(
      jsonb_agg(
        jsonb_build_object('songId', song_id, 'notes', '')
        order by song_order
      ),
      '[]'::jsonb
    )
    from unnest(song_ids_legacy) with ordinality as existing_songs(song_id, song_order)
  )
end;

alter table public.service_items
drop column song_ids_legacy;

alter table public.service_items
add constraint service_items_song_ids_is_array
check (song_ids is null or jsonb_typeof(song_ids) = 'array');

notify pgrst, 'reload schema';

commit;
