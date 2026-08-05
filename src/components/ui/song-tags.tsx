export function SongMetadataLine({ bpm, className = "", songKey, timeSignature }: { bpm?: number | null; className?: string; songKey?: string | null; timeSignature?: string | null }) {
  const values = [songKey?.trim(), bpm ? `${bpm} BPM` : null, timeSignature?.trim()].filter(Boolean);
  if (values.length === 0) return null;
  return <p className={`text-sm font-medium text-zinc-500 ${className}`}>{values.join(" • ")}</p>;
}
