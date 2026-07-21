import Image from "next/image";
import Link from "next/link";
import type { SongSummary } from "@/lib/database.types";
import { BpmTag, KeyTag } from "@/components/ui/song-tags";

export function SongCard({ song, onToggleFavorite, isUpdating = false, showFavorite = true }: { song: SongSummary; onToggleFavorite: (id: string) => void; isUpdating?: boolean; showFavorite?: boolean }) {
  return (
    <article className="group relative overflow-hidden rounded-3xl border border-white/8 bg-zinc-900/65 transition duration-200 active:scale-[0.99] hover:-translate-y-0.5 hover:border-white/14 hover:bg-zinc-900">
      {showFavorite ? (
        <button
          type="button"
          onClick={() => onToggleFavorite(song.id)}
          disabled={isUpdating}
          aria-label={song.favorite ? `Remove ${song.title} from favorites` : `Add ${song.title} to favorites`}
          aria-pressed={song.favorite}
          className={`absolute right-5 top-5 z-10 grid size-11 place-items-center rounded-full bg-zinc-950/75 text-2xl shadow-lg backdrop-blur-md transition duration-200 active:scale-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 disabled:opacity-60 ${song.favorite ? "text-amber-300" : "text-zinc-300 hover:text-white"}`}
        >
          <span aria-hidden="true">{song.favorite ? "★" : "☆"}</span>
        </button>
      ) : null}

      <Link href={`/song/${song.id}`} className="block p-3.5 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-emerald-400">
        <div className="relative aspect-square overflow-hidden rounded-xl bg-zinc-800">
          <Image src={song.cover} alt={`Cover for ${song.title}`} fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw" className="object-cover transition duration-500 group-hover:scale-105" />
        </div>
        <div className="px-1 pb-1 pt-5">
          <h2 className="truncate text-lg font-semibold tracking-tight text-white">{song.title}</h2>
          <p className="mt-1.5 truncate text-base text-zinc-400">{song.artist}</p>
          <div className="mt-5 flex flex-wrap items-center gap-2 text-sm text-zinc-500">
            <KeyTag value={song.key} />
            <BpmTag value={song.bpm} />
            <span className="ml-auto">{song.duration}</span>
          </div>
        </div>
      </Link>
    </article>
  );
}
