export const DEFAULT_SONG_COVER = "/images/default-song-cover.png";

export function getSongCoverSource(coverUrl: string | null | undefined) {
  return coverUrl?.trim() || DEFAULT_SONG_COVER;
}
