import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MainContainer } from "@/components/ui/main-container";
import { parseAssignmentText } from "@/lib/assignment-text";
import { hasAuthenticatedUser } from "@/lib/auth";
import type { ServiceItem, ServiceItemNote } from "@/lib/service";
import { normalizeServiceItemSongIds } from "@/lib/service-item-normalization";
import { buildServiceSchedule } from "@/lib/service-schedule";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Notas del servicio | Gracia Worship" };
export const dynamic = "force-dynamic";

export default async function ServiceNotesPage({ params }: { params: Promise<{ id: string }> }) {
  const serviceId = Number((await params).id);
  if (!Number.isSafeInteger(serviceId) || serviceId < 1 || serviceId > 32767) notFound();
  const authenticated = await hasAuthenticatedUser();

  const supabase = await createSupabaseServerClient();
  const [{ data: service, error: serviceError }, { data: itemData }, { data: noteData }] = await Promise.all([
    supabase.from("active_setlist").select("service_name, service_date, service_time, leader_notes, status").eq("id", serviceId).maybeSingle(),
    supabase.from("service_items").select("id, position, type, title, details, planned_duration_seconds, song_ids, song_id, created_at").eq("service_id", serviceId).order("position"),
    supabase.from("service_item_notes").select("service_id, service_item_id, notes").eq("service_id", serviceId),
  ]);
  if (serviceError || !service) notFound();
  const items = (itemData ?? []).map(normalizeServiceItemSongIds) as ServiceItem[];
  const notes = (noteData ?? []) as ServiceItemNote[];
  const notesByItem = new Map(notes.map((note) => [note.service_item_id, note.notes]));
  const songIds = Array.from(new Set(items.flatMap((item) => [...(item.song_ids ?? []).map((entry) => entry.songId), ...(item.song_id ? [item.song_id] : [])])));
  const { data: songs } = songIds.length ? await supabase.from("songs").select("id, title, duration").in("id", songIds) : { data: [] };
  const schedule = buildServiceSchedule(items, songs ?? [], service.service_time);
  const notedItems = items.filter((item) => notesByItem.get(item.id)?.trim());
  const serviceSchedule = [service.service_date ? formatServiceDate(service.service_date) : null, service.service_time ? formatServiceTime(service.service_time) : null].filter(Boolean).join(" · ");
  const hasAnyNotes = Boolean(service.leader_notes?.trim()) || notedItems.length > 0;
  const editable = service.status === "active" || service.status === "planned";

  return <main className="min-h-screen pb-[calc(5rem+env(safe-area-inset-bottom))] pt-3 sm:py-10 lg:py-0"><MainContainer className="max-w-3xl lg:max-w-none lg:px-0"><div className="lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
    <aside className="hidden min-h-screen border-r border-white/[0.07] bg-zinc-950/35 p-6 lg:block"><p className="text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-emerald-400">Servicio</p><h2 className="mt-4 text-lg font-semibold text-white">{localizeDefaultServiceName(service.service_name)}</h2><p className="mt-1 text-sm leading-6 text-zinc-400">{serviceSchedule || "Horario por confirmar"}</p><p className="mt-1 text-xs font-medium text-zinc-500">{serviceStatusLabel(service.status)}</p><ServiceNavigation authenticated={authenticated} desktop serviceId={serviceId} /></aside>
    <div className="min-w-0 lg:px-8 lg:py-7 xl:px-12"><div className="mx-auto max-w-3xl">
      <header className="border-b border-white/[0.08] pb-3 lg:pb-5"><Link href={`/service/${serviceId}`} className="text-xs font-semibold text-zinc-500 hover:text-emerald-300 lg:hidden">← Orden del servicio</Link><h1 className="mt-2 text-2xl font-bold tracking-[-0.03em] text-white lg:mt-0 lg:text-[2rem]">{localizeDefaultServiceName(service.service_name)}</h1><div className="mt-0.5 flex items-center gap-2 text-sm text-zinc-400"><span>Notas</span><span className="text-zinc-700">·</span><span>{serviceSchedule || "Horario por confirmar"}</span><span className="text-zinc-700">·</span><span>{serviceStatusLabel(service.status)}</span></div></header>
      <ServiceNavigation authenticated={authenticated} serviceId={serviceId} />
      {!hasAnyNotes ? <section className="border-b border-white/[0.07] py-8"><p className="text-base font-medium text-zinc-300">No hay notas para este servicio.</p>{editable ? <p className="mt-1 text-sm text-zinc-500">Agrega notas desde los elementos del orden del servicio.</p> : null}</section> : null}
      {service.leader_notes?.trim() ? <section className="border-b border-white/[0.07] py-5"><p className="text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-emerald-400">General</p><p className="mt-3 whitespace-pre-wrap text-base leading-7 text-zinc-200 sm:text-[1.0625rem]">{service.leader_notes.trim()}</p></section> : null}
      {notedItems.length ? <section className="py-5"><p className="text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-emerald-400">Notas por momento</p><ol className="mt-2 divide-y divide-white/[0.07] border-y border-white/[0.07]">{notedItems.map((item) => { const assignment = parseAssignmentText(item.details ?? ""); const timeKey = item.type === "worship" && item.song_ids?.[0] ? `${item.id}:${item.song_ids[0].songId}` : item.id; return <li key={item.id} className="py-4"><div className="flex items-baseline gap-3"><time className="w-16 shrink-0 text-xs font-medium tabular-nums text-zinc-500">{schedule.times.get(timeKey) ?? "—"}</time><div className="min-w-0"><h2 className="text-base font-semibold text-white sm:text-lg">{item.title}</h2>{assignment.name || assignment.role ? <p className="mt-0.5 text-xs text-zinc-500">{[assignment.name, assignment.role].filter(Boolean).join(" · ")}</p> : null}</div></div><p className="ml-[4.75rem] mt-3 whitespace-pre-wrap text-base leading-7 text-zinc-200 sm:text-[1.0625rem]">{notesByItem.get(item.id)}</p></li>; })}</ol></section> : null}
    </div></div>
  </div></MainContainer></main>;
}

const navClass = "flex min-h-11 shrink-0 items-center border-b-2 border-transparent px-2.5 text-zinc-400";
function ServiceNavigation({ authenticated, desktop = false, serviceId }: { authenticated: boolean; desktop?: boolean; serviceId: number }) { const items = [{ href: `/service/${serviceId}`, label: "Orden" }, ...(authenticated ? [{ href: `/admin/service-team?service=${serviceId}`, label: "Equipo" }, { href: `/admin/resources?service=${serviceId}`, label: "Recursos" }] : []), { href: `/service/${serviceId}/notes`, label: "Notas", active: true }, { href: `/service/${serviceId}/rehearsal`, label: "Ensayo" }, { href: `/service/${serviceId}/report`, label: "Reporte" }]; return desktop ? <nav aria-label="Secciones del servicio" className="mt-7 space-y-1 text-sm font-medium">{items.map((item) => item.active ? <span key={item.label} aria-current="page" className="block rounded-lg bg-emerald-400/[0.09] px-3 py-2.5 text-emerald-300">{item.label}</span> : <Link key={item.label} href={item.href} className="block rounded-lg px-3 py-2.5 text-zinc-400 hover:bg-white/[0.04] hover:text-white">{item.label}</Link>)}</nav> : <nav aria-label="Secciones del servicio" className="-mx-4 flex h-11 gap-0.5 overflow-x-auto border-b border-white/[0.07] px-4 text-[0.8125rem] font-semibold [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden">{items.map((item) => item.active ? <span key={item.label} aria-current="page" className={`${navClass} border-emerald-400 text-emerald-300`}>{item.label}</span> : <Link key={item.label} href={item.href} className={navClass}>{item.label}</Link>)}</nav>; }
function localizeDefaultServiceName(value: string) { return value === "Saturday Service" ? "Servicio del Sábado" : value; }
function serviceStatusLabel(value: string) { return value === "active" ? "Activo" : value === "planned" ? "Planificado" : value === "completed" ? "Completado" : "Archivado"; }
function formatServiceDate(value: string) { const [year, month, day] = value.split("-").map(Number); return new Intl.DateTimeFormat("es-419", { weekday: "short", day: "numeric", month: "short" }).format(new Date(year, month - 1, day)).replaceAll(".", ""); }
function formatServiceTime(value: string) { const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/); if (!match) return value; const hour = Number(match[1]); return `${hour % 12 || 12}:${match[2]} ${hour >= 12 ? "PM" : "AM"}`; }
