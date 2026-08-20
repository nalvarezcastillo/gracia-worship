export type PublicSongKey = {
  id: string;
  key_name: string;
  audio_url: string | null;
  sheet_url: string | null;
  grid_bpm: number | null;
  grid_beats_per_bar: number | null;
  grid_beat_unit: number | null;
  grid_offset_seconds: number | null;
  sort_order: number;
};

type SongKeySelectorProps = {
  keys: PublicSongKey[];
  onSelect: (key: PublicSongKey) => void;
  polished?: boolean;
  selectedKey: PublicSongKey | null;
};

export function SongKeySelector({ keys, onSelect, polished = false, selectedKey }: SongKeySelectorProps) {

  if (keys.length <= 1) return null;

  return (
    <div className={polished ? "mt-3" : "mt-4"} aria-label="Selector de tonalidad">
      <p className={polished ? "mb-1.5 text-sm font-medium text-zinc-500" : "mb-2 text-[0.65rem] font-bold uppercase tracking-[0.18em] text-zinc-500"}>Tonalidad</p>
      <div role="group" aria-label="Seleccionar tonalidad" className="inline-flex max-w-full overflow-x-auto rounded-xl border border-white/[0.08] bg-zinc-900/70 p-1">
        {keys.map((key) => {
          const isSelected = key.id === selectedKey?.id;
          return (
            <button
              key={key.id}
              type="button"
              onClick={() => onSelect(key)}
              aria-label={`Seleccionar tonalidad ${key.key_name}`}
              aria-pressed={isSelected}
              className={`min-h-11 min-w-11 rounded-lg px-3 text-sm font-semibold transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 ${isSelected ? "bg-emerald-400 text-zinc-950" : "text-zinc-400 hover:bg-white/[0.05] hover:text-white"}`}
            >
              {key.key_name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
