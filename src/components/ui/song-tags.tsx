function SongTag({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex min-h-7 items-center rounded-full border border-white/8 bg-white/[0.055] px-2.5 text-xs font-semibold text-zinc-300 shadow-sm shadow-black/10">
      <span className="mr-1 text-zinc-500">{label}</span>
      {value}
    </span>
  );
}

export function KeyTag({ value }: { value: string }) {
  return <SongTag label="Key" value={value} />;
}

export function BpmTag({ value }: { value: number }) {
  return <SongTag label="BPM" value={String(value)} />;
}
