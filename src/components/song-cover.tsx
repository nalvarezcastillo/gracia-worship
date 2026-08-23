"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { DEFAULT_SONG_COVER, getSongCoverSource } from "@/lib/song-cover";

export function SongCover({ alt = "", className, height, priority = false, src, width }: { alt?: string; className: string; height: number; priority?: boolean; src?: string | null; width: number }) {
  const normalizedSource = getSongCoverSource(src);
  const [displayedSource, setDisplayedSource] = useState(normalizedSource);

  useEffect(() => { setDisplayedSource(normalizedSource); }, [normalizedSource]);

  return <Image alt={alt} className={className} height={height} onError={() => { if (displayedSource !== DEFAULT_SONG_COVER) setDisplayedSource(DEFAULT_SONG_COVER); }} priority={priority} src={displayedSource} unoptimized width={width} />;
}
