import { notFound } from "next/navigation";
import { MultitrackTestPlayer } from "@/components/multitrack-test-player";

export default function MultitrackTestPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-8 text-white sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <header>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-400">Development prototype</p>
          <h1 className="mt-2 text-3xl font-bold tracking-[-0.035em] sm:text-4xl">Multitrack Sync Test</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
            All stems are decoded before playback and scheduled against one shared AudioContext clock.
          </p>
        </header>

        <MultitrackTestPlayer />
      </div>
    </main>
  );
}
