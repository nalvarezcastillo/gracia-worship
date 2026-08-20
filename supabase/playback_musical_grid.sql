begin;

alter table public.song_keys
  add column if not exists grid_bpm numeric(8,3),
  add column if not exists grid_beats_per_bar smallint,
  add column if not exists grid_beat_unit smallint,
  add column if not exists grid_offset_seconds numeric(10,3);

alter table public.song_keys drop constraint if exists song_keys_musical_grid_check;
alter table public.song_keys add constraint song_keys_musical_grid_check check (
  num_nonnulls(
    grid_bpm,
    grid_beats_per_bar,
    grid_beat_unit,
    grid_offset_seconds
  ) = 0
  or
  (
    num_nonnulls(
      grid_bpm,
      grid_beats_per_bar,
      grid_beat_unit,
      grid_offset_seconds
    ) = 4
    and grid_bpm > 0
    and grid_bpm <= 400
    and grid_beats_per_bar between 1 and 32
    and grid_beat_unit in (1, 2, 4, 8, 16)
    and grid_offset_seconds >= 0
  )
);

alter table public.song_sections
  add column if not exists bar_number integer,
  add column if not exists beat_number smallint,
  add column if not exists beat_fraction numeric(8,6);

alter table public.song_sections drop constraint if exists song_sections_musical_position_check;
alter table public.song_sections add constraint song_sections_musical_position_check check (
  num_nonnulls(
    bar_number,
    beat_number,
    beat_fraction
  ) = 0
  or
  (
    num_nonnulls(
      bar_number,
      beat_number,
      beat_fraction
    ) = 3
    and bar_number >= 1
    and beat_number >= 1
    and beat_fraction >= 0
    and beat_fraction < 1
  )
);

notify pgrst, 'reload schema';
commit;
