import Link from "next/link";
import { MusicIcon } from "@/components/icons";
import type { SongSummary } from "@/lib/database.types";
import { BpmTag, KeyTag } from "@/components/ui/song-tags";

export function SongCard({ song, onToggleFavorite, isUpdating = false, showFavorite = false }: { song: SongSummary; onToggleFavorite: (id: string) => void; isUpdating?: boolean; showFavorite?: boolean }) {
  return (
    <article className="group transition-all duration-200 ease-out hover:bg-gradient-to-r hover:from-emerald-400/[0.07] hover:to-transparent active:bg-white/[0.06]">
      <Link href={`/song/${song.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-emerald-400 sm:px-5">
        <MusicIcon className="size-4 shrink-0 text-emerald-400/70" />
        <h2 className="min-w-0 flex-1 truncate text-[0.95rem] font-semibold tracking-tight text-zinc-100 transition-colors duration-200 group-hover:text-white sm:text-base">{song.title}</h2>
        <div className="flex shrink-0 items-center gap-2">
          <KeyTag value={song.key} />
          <BpmTag value={song.bpm} />
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
        </div>
      </Link>
    </article>
  );
}
