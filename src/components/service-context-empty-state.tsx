import { SecondaryButton } from "@/components/ui/action-button";

export function ServiceContextEmptyState({ message }: { message: string }) {
  return (
    <section className="mt-6 border-y border-white/[0.07] py-12 text-center">
      <p className="text-sm text-zinc-400">{message}</p>
      <SecondaryButton href="/service" className="mt-4 min-h-10 rounded-xl px-4 text-sm">
        Ver servicios
      </SecondaryButton>
    </section>
  );
}
