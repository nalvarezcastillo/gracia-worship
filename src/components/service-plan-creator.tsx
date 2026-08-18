"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ServiceSummary } from "@/lib/services";
import { createServicePlan, duplicateServicePlan } from "@/lib/service-plan-mutations";

type Mode = "choose" | "blank" | "duplicate";

export function ServicePlanCreator({ services, wide = false }: { services: ServiceSummary[]; wide?: boolean }) {
  const router = useRouter();
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const initialChoiceRef = useRef<HTMLButtonElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("choose");
  const [name, setName] = useState("Servicio del Sábado");
  const [date, setDate] = useState(() => suggestNextServiceDate(services));
  const [time, setTime] = useState("19:00");
  const [sourceId, setSourceId] = useState(services[0]?.id ?? 0);
  const [copyOrder, setCopyOrder] = useState(true);
  const [copyTeam, setCopyTeam] = useState(false);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    initialChoiceRef.current?.focus();
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSaving) closeDialog();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isOpen, isSaving]);

  useEffect(() => {
    if (isOpen && mode !== "choose") nameInputRef.current?.focus();
  }, [isOpen, mode]);

  const hasScheduleConflict = Boolean(date && time && services.some((service) => service.serviceDate === date && service.serviceTime === time));

  function openDialog() {
    setMode("choose");
    setName("Servicio del Sábado");
    setDate(suggestNextServiceDate(services));
    setTime("19:00");
    setSourceId(services[0]?.id ?? 0);
    setCopyOrder(true);
    setCopyTeam(false);
    setError("");
    setIsOpen(true);
  }

  function closeDialog() {
    setIsOpen(false);
    setError("");
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }

  function chooseBlank() {
    setName("Servicio del Sábado");
    setDate(suggestNextServiceDate(services));
    setTime("19:00");
    setError("");
    setMode("blank");
  }

  function chooseDuplicate() {
    const source = services.find((service) => service.id === sourceId) ?? services[0];
    if (!source) return;
    applySourceDefaults(source);
    setError("");
    setMode("duplicate");
  }

  function applySourceDefaults(source: ServiceSummary) {
    setSourceId(source.id);
    setName(source.serviceName);
    setTime(isNormalizedTime(source.serviceTime) ? source.serviceTime : "19:00");
    setDate(source.serviceDate ? addDays(source.serviceDate, 7) : suggestNextServiceDate(services));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;
    const nextName = name.trim();
    if (!nextName) { setError("Escribe el nombre del servicio."); return; }
    if (!date) { setError("Selecciona la fecha del servicio."); return; }
    if (!isNormalizedTime(time)) { setError("Selecciona una hora válida."); return; }
    if (mode === "duplicate" && !sourceId) { setError("Selecciona el servicio base."); return; }

    setIsSaving(true);
    setError("");
    try {
      const newServiceId = mode === "duplicate"
        ? await duplicateServicePlan({
            p_source_service_id: sourceId,
            p_service_name: nextName,
            p_service_date: date,
            p_service_time: time,
            p_copy_order: copyOrder,
            p_copy_team: copyTeam,
          })
        : await createServicePlan({ p_service_name: nextName, p_service_date: date, p_service_time: time });
      setIsOpen(false);
      router.push(`/service/${newServiceId}`);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "No fue posible crear el servicio.");
      setIsSaving(false);
    }
  }

  return (
    <>
      <button ref={triggerRef} type="button" onClick={openDialog} className={`inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-400 px-4 text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 ${wide ? "w-full" : "w-full sm:w-auto"}`}>+ Crear servicio</button>
      {isOpen ? (
        <div role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isSaving) closeDialog(); }} className="fixed inset-0 z-[80] flex items-end justify-center overflow-y-auto bg-black/75 px-0 pt-12 backdrop-blur-sm sm:items-center sm:px-4 sm:py-8">
          <section role="dialog" aria-modal="true" aria-labelledby={titleId} className="relative max-h-[calc(100dvh-3rem)] w-full overflow-y-auto rounded-t-3xl border border-white/10 bg-zinc-900 p-5 shadow-2xl shadow-black/60 sm:max-w-lg sm:rounded-3xl sm:p-7">
            <button type="button" onClick={closeDialog} disabled={isSaving} aria-label="Cerrar" className="absolute right-4 top-4 grid size-10 place-items-center rounded-xl text-xl text-zinc-500 hover:bg-white/[0.06] hover:text-white focus-visible:outline-2 focus-visible:outline-emerald-400">×</button>
            <p className="text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-emerald-400">Planificación</p>
            <h2 id={titleId} className="mt-2 pr-12 text-2xl font-bold tracking-tight text-white">Crear servicio</h2>

            {mode === "choose" ? (
              <div className="mt-6">
                <p className="text-sm font-medium text-zinc-300">¿Cómo deseas comenzar?</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <button ref={initialChoiceRef} type="button" onClick={chooseBlank} className={choiceStyles}><span className="block font-semibold text-white">Crear vacío</span><span className="mt-1 block text-xs leading-5 text-zinc-500">Comienza con un orden y equipo vacíos.</span></button>
                  <button type="button" onClick={chooseDuplicate} disabled={!services.length} className={`${choiceStyles} disabled:cursor-not-allowed disabled:opacity-40`}><span className="block font-semibold text-white">Duplicar servicio existente</span><span className="mt-1 block text-xs leading-5 text-zinc-500">Usa otro servicio como punto de partida.</span></button>
                </div>
                {!services.length ? <p className="mt-3 text-xs text-zinc-500">Aún no hay servicios disponibles para duplicar.</p> : null}
              </div>
            ) : (
              <form onSubmit={submit} className="mt-6 space-y-5">
                {mode === "duplicate" ? (
                  <Field label="Servicio base">
                    <select value={sourceId} onChange={(event) => { const source = services.find((service) => service.id === Number(event.target.value)); if (source) applySourceDefaults(source); }} className={fieldStyles}>
                      {services.map((service) => <option key={service.id} value={service.id}>{formatSourceOption(service)}</option>)}
                    </select>
                  </Field>
                ) : null}
                <Field label="Nombre del servicio"><input ref={nameInputRef} value={name} onChange={(event) => setName(event.target.value)} required autoComplete="off" className={fieldStyles} /></Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Fecha"><input type="date" value={date} onChange={(event) => setDate(event.target.value)} required className={fieldStyles} /></Field>
                  <Field label="Hora"><input type="time" value={time} onChange={(event) => setTime(event.target.value)} required step={60} className={fieldStyles} /></Field>
                </div>

                {mode === "duplicate" ? <div className="space-y-3 border-y border-white/[0.07] py-4"><Checkbox checked={copyOrder} onChange={setCopyOrder} label="Copiar orden del servicio" help="Copia canciones, momentos y duraciones planeadas." /><Checkbox checked={copyTeam} onChange={setCopyTeam} label="Copiar equipo y recursos" help="Copia las asignaciones actuales de personas, micrófonos y recursos." /></div> : null}
                {hasScheduleConflict ? <p role="status" className="rounded-xl border border-amber-400/15 bg-amber-400/[0.06] px-3 py-2.5 text-sm text-amber-200">Ya existe otro servicio programado para este horario.</p> : null}
                {error ? <p role="alert" className="text-sm leading-6 text-rose-300">{error}</p> : null}

                <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
                  <button type="button" onClick={() => { setMode("choose"); setError(""); }} disabled={isSaving} className={secondaryStyles}>Atrás</button>
                  <button type="submit" disabled={isSaving} className={primaryStyles}>{isSaving ? mode === "duplicate" ? "Duplicando servicio…" : "Creando servicio…" : mode === "duplicate" ? "Duplicar servicio" : "Crear servicio"}</button>
                </div>
              </form>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}

function Field({ children, label }: { children: React.ReactNode; label: string }) { return <label className="block text-sm font-medium text-zinc-300"><span className="mb-2 block">{label}</span>{children}</label>; }
function Checkbox({ checked, help, label, onChange }: { checked: boolean; help: string; label: string; onChange: (checked: boolean) => void }) { return <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl px-1 py-2 focus-within:outline-2 focus-within:outline-emerald-400"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-0.5 size-5 accent-emerald-400" /><span><span className="block text-sm font-semibold text-zinc-200">{label}</span><span className="mt-1 block text-xs leading-5 text-zinc-500">{help}</span></span></label>; }

const choiceStyles = "min-h-28 rounded-2xl border border-white/10 bg-white/[0.025] p-4 text-left transition-colors hover:border-emerald-400/25 hover:bg-emerald-400/[0.04] focus-visible:outline-2 focus-visible:outline-emerald-400";
const fieldStyles = "min-h-12 w-full rounded-xl border border-white/10 bg-zinc-950 px-3 text-base text-white outline-none transition-colors focus:border-emerald-400/50 focus:ring-2 focus:ring-emerald-400/15 [color-scheme:dark]";
const secondaryStyles = "min-h-12 rounded-xl border border-white/10 px-5 text-sm font-semibold text-zinc-200 transition-colors hover:bg-white/[0.05] disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-emerald-400";
const primaryStyles = "min-h-12 rounded-xl bg-emerald-400 px-5 text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400";

function isNormalizedTime(value: string) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(value); }
function addDays(value: string, days: number) { const [year, month, day] = value.split("-").map(Number); const date = new Date(year, month - 1, day); date.setDate(date.getDate() + days); return toDateInput(date); }
function suggestNextServiceDate(services: ServiceSummary[]) { const today = toDateInput(new Date()); const latest = services.filter((service) => service.serviceDate && service.serviceDate >= today && (service.status === "active" || service.status === "planned")).map((service) => service.serviceDate as string).sort().at(-1); const anchor = latest ? parseDate(latest) : new Date(); const daysUntilSaturday = (6 - anchor.getDay() + 7) % 7 || 7; anchor.setDate(anchor.getDate() + daysUntilSaturday); return toDateInput(anchor); }
function parseDate(value: string) { const [year, month, day] = value.split("-").map(Number); return new Date(year, month - 1, day); }
function toDateInput(value: Date) { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`; }
function formatSourceOption(service: ServiceSummary) { const date = service.serviceDate ? new Intl.DateTimeFormat("es-419", { weekday: "short", day: "numeric", month: "short" }).format(parseDate(service.serviceDate)).replaceAll(".", "") : "Sin fecha"; return `${date} · ${service.serviceName} · ${statusLabel(service.status)}`; }
function statusLabel(status: ServiceSummary["status"]) { if (status === "active") return "Próximo"; if (status === "planned") return "Planificado"; if (status === "completed") return "Completado"; return "Archivado"; }
