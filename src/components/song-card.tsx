import Link from "next/link";
import type { SongSummary } from "@/lib/database.types";
import { SongMetadataLine } from "@/components/ui/song-tags";

export function SongCard({ song, onToggleFavorite, isUpdating = false, showFavorite = false }: { song: SongSummary; onToggleFavorite: (id: string) => void; isUpdating?: boolean; showFavorite?: boolean }) {
  return (
    <article className="group transition-colors duration-200 hover:bg-white/[0.035] active:bg-white/[0.06]">
      <Link href={`/song/${song.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-emerald-400 sm:px-5 lg:grid lg:grid-cols-[minmax(180px,1.4fr)_minmax(140px,1fr)_72px_72px_80px_32px] lg:gap-4 lg:px-3 lg:py-2.5">
        <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full border border-zinc-700 bg-zinc-900 text-sm font-semibold uppercase text-emerald-400 lg:hidden">
          {song.title.trim().charAt(0) || "?"}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[0.95rem] font-semibold tracking-tight text-zinc-100 transition-colors duration-200 group-hover:text-white sm:text-base">{song.title}</h2>
          <SongMetadataLine songKey={song.key} bpm={song.bpm} timeSignature={song.time_signature} className="mt-0.5 truncate text-xs lg:hidden" />
        </div>
        <span className="hidden truncate text-sm text-zinc-400 lg:block">{song.artist || "—"}</span>
        <span className="hidden text-sm font-medium text-zinc-300 lg:block">{song.key || "—"}</span>
        <span className="hidden text-sm tabular-nums text-zinc-400 lg:block">{song.bpm || "—"}</span>
        <span className="hidden text-sm tabular-nums text-zinc-400 lg:block">{song.duration || "—"}</span>
        <div className="flex shrink-0 items-center lg:justify-end">
          {showFavorite ? (
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                onToggleFavorite(song.id);
              }}
              disabled={isUpdating}
              aria-label={song.favorite ? `Remove ${song.title} from favorites` : `Add ${song.title} to favorites`}
              aria-pressed={song.favorite}
              className="grid size-10 place-items-center rounded-full text-xl text-zinc-300 disabled:opacity-60"
            >
              <span aria-hidden="true">{song.favorite ? "★" : "☆"}</span>
            </button>
          ) : null}
          <span aria-hidden="true" className="hidden text-lg text-zinc-600 lg:block">›</span>
        </div>
      </Link>
    </article>
  );
}
