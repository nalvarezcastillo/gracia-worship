import Image from "next/image";
import { MusicIcon } from "@/components/icons";
import { AppSectionCard } from "@/components/app-section-card";
import { RecentSongCard } from "@/components/recent-song-card";
import { ServiceCountdownCard } from "@/components/service-countdown-card";
import { PrimaryButton, SecondaryButton } from "@/components/ui/action-button";
import { MainContainer } from "@/components/ui/main-container";
import { getActiveSetlist } from "@/lib/setlist";
import { getAppSettings } from "@/lib/app-settings";
import { getCurrentServiceTeam, groupCurrentServiceTeam } from "@/lib/current-service-team";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ restored?: string }> }) {
  const [setlist, appSettings, serviceTeam] = await Promise.all([
    getActiveSetlist(),
    getAppSettings(),
    getCurrentServiceTeam(),
  ]);
  const previewSongs = setlist?.songs.slice(0, 5) ?? [];
  const remainingSongs = Math.max((setlist?.songs.length ?? 0) - previewSongs.length, 0);
  const serviceTeamGroups = groupCurrentServiceTeam(serviceTeam);
  const serviceSchedule = setlist ? [
    setlist.serviceDate ? formatServiceDate(setlist.serviceDate) : null,
    setlist.serviceTime ? formatServiceTime(setlist.serviceTime) : null,
  ].filter(Boolean).join(" • ") : "";

  return (
    <main className="min-h-screen py-8 sm:py-12">
      <MainContainer className="max-w-4xl">
        <header className="flex flex-col items-center text-center">
          <Image
            src={appSettings.logo_url ?? "/branding/gracia-worship-logo.png"}
            alt="Logo de Gracia Worship"
            width={1254}
            height={1254}
            priority
            className="h-auto w-[170px] object-contain sm:w-[220px]"
          />
          <h1 className="mt-3 text-[28px] font-bold tracking-[-0.03em] text-white sm:text-4xl">{appSettings.ministry_name}</h1>
        </header>

        {(await searchParams).restored === "1" ? <div role="status" className="fixed inset-x-4 bottom-24 z-[60] mx-auto max-w-sm rounded-2xl border border-emerald-400/20 bg-zinc-900 px-4 py-3 text-center text-sm font-medium text-emerald-300 shadow-2xl">✅ Servicio restaurado correctamente.</div> : null}

        <RecentSongCard />

        <AppSectionCard
          eyebrow="Próximo servicio"
          title={setlist ? localizeDefaultServiceName(setlist.serviceName) : "Próximo servicio"}
          subtitle={setlist ? (setlist.serviceDate ? <><p>{formatServiceDate(setlist.serviceDate)}</p><p>{formatServiceTime(setlist.serviceTime)}</p></> : setlist.serviceTime) : "Next service is not configured."}
        >
          <div className="px-4 py-3 sm:px-6 sm:py-4">
            {previewSongs.length > 0 ? (
              <ol className="divide-y divide-white/[0.055]">
                {previewSongs.map((song, index) => (
                  <li key={song.id} className="flex min-h-10 items-center gap-3 px-1 py-1.5 text-sm font-semibold text-zinc-200 sm:text-base">
                    <span className="w-5 shrink-0 text-xs tabular-nums text-zinc-600">{index + 1}</span>
                    <MusicIcon className="size-4 shrink-0 text-emerald-400/65" />
                    <span className="truncate">{song.title}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="py-4 text-center text-sm text-zinc-500">No songs in the setlist.</p>
            )}

            {remainingSongs > 0 ? <p className="mt-2 text-sm font-medium text-zinc-500">+{remainingSongs} more</p> : null}
            <div className="mt-4 flex flex-col gap-3 sm:flex-row"><PrimaryButton href="/setlist" className="w-full sm:w-auto">Abrir repertorio</PrimaryButton><SecondaryButton href="/archive" className="w-full sm:w-auto">Archivo</SecondaryButton></div>
          </div>
        </AppSectionCard>

        {serviceTeamGroups.length ? (
          <AppSectionCard eyebrow="Equipo del servicio" title="Equipo del servicio" subtitle={`${serviceTeamGroups.length} ${serviceTeamGroups.length === 1 ? "persona sirviendo" : "personas sirviendo"}`}>
            <div className="divide-y divide-white/[0.055] px-4 sm:px-6">
              {serviceTeamGroups.map((person) => (
                <div key={person.personName.toLocaleLowerCase("es")} className="py-3 sm:py-4">
                  <p className="text-base font-semibold text-white sm:text-lg">{person.personName}</p>
                  {person.roles.length || person.microphones.length ? (
                    <p className="mt-1.5 text-sm text-zinc-400">{[...person.roles, ...person.microphones].join(" • ")}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </AppSectionCard>
        ) : null}

        {setlist?.leaderNotes?.trim() ? (
          <AppSectionCard eyebrow="Notas" title="Notas del líder">
            <div className="px-5 py-4 sm:px-6 sm:py-5"><p className="whitespace-pre-wrap break-words text-base leading-7 text-zinc-300">{setlist.leaderNotes}</p></div>
          </AppSectionCard>
        ) : null}

        {setlist ? <ServiceCountdownCard serviceDate={setlist.serviceDate} serviceTime={setlist.serviceTime} serviceName={localizeDefaultServiceName(setlist.serviceName)} serviceSchedule={serviceSchedule} /> : null}
      </MainContainer>
    </main>
  );
}

function formatServiceDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const formatted = new Intl.DateTimeFormat("es-419", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(date);
  return formatted.charAt(0).toLocaleUpperCase("es-419") + formatted.slice(1);
}

function formatServiceTime(value: string) {
  const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return value;
  const hour = Number(match[1]);
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${match[2]} ${period}`;
}

function localizeDefaultServiceName(value: string) {
  return value === "Saturday Service" ? "Servicio del Sábado" : value;
}
