"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { LockKeyhole, Users } from "lucide-react";
import { AppActionBar } from "@/components/app-action-bar";
import { AppList, AppListRow } from "@/components/app-list";
import { PrimaryButton } from "@/components/ui/action-button";
import type { CurrentServiceTeamMember, TeamCopySource } from "@/lib/current-service-team";
import { buildResourceAvailabilityMap, joinResourceUsages } from "@/lib/resource-availability";
import type { ResourceCategory, ResourceUsage, ServiceResource } from "@/lib/resources";
import type { TeamMember } from "@/lib/team";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { appFieldStyles, appRowActionStyles } from "@/components/ui/styles";

const roles = ["Voz", "Piano", "Teclados", "Guitarra Eléctrica", "Guitarra Acústica", "Bajo", "Batería", "Director", "Producción", "Audio", "Luces", "Cámara", "Streaming", "Multimedia", "Tracks", "Playback", "Predicación"];
const nameCollator = new Intl.Collator("es", { sensitivity: "base" });

type Props = {
  availableResources: ServiceResource[];
  copySources: TeamCopySource[];
  initialAssignments: CurrentServiceTeamMember[];
  initialUsages: ResourceUsage[];
  resourceCategories: ResourceCategory[];
  serviceId: number;
  serviceName: string;
  teamMembers: TeamMember[];
};

export function ManageCurrentServiceTeam({ availableResources, copySources, initialAssignments, initialUsages, resourceCategories, serviceId, serviceName, teamMembers }: Props) {
  const [assignments, setAssignments] = useState(initialAssignments);
  const [usages, setUsages] = useState(initialUsages);
  const [editing, setEditing] = useState<CurrentServiceTeamMember | null>(null);
  const [open, setOpen] = useState(false);
  const [memberId, setMemberId] = useState("");
  const [personName, setPersonName] = useState("");
  const [roleName, setRoleName] = useState("");
  const [customRole, setCustomRole] = useState(false);
  const [selectedResourceIds, setSelectedResourceIds] = useState<string[]>([]);
  const [resourceQuery, setResourceQuery] = useState("");
  const [openCategoryId, setOpenCategoryId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [copyOpen, setCopyOpen] = useState(false);
  const [copySourceId, setCopySourceId] = useState(copySources[0]?.serviceId ?? 0);
  const [copyBusy, setCopyBusy] = useState(false);
  const [copyError, setCopyError] = useState("");
  const [copyFeedback, setCopyFeedback] = useState("");

  const resourcesByCategory = useMemo(() => resourceCategories.map((category) => ({
    category,
    resources: availableResources.filter((resource) => resource.category_id === category.id).sort((a, b) => Number(b.active) - Number(a.active) || nameCollator.compare(a.name, b.name)),
  })).filter((group) => group.resources.length), [availableResources, resourceCategories]);
  const filteredResourceGroups = useMemo(() => {
    const query = resourceQuery.trim().toLocaleLowerCase("es");
    return resourcesByCategory.map((group) => ({
      ...group,
      resources: group.resources.filter((resource) => !query || group.category.name.toLocaleLowerCase("es").includes(query) || resource.name.toLocaleLowerCase("es").includes(query)),
    })).filter((group) => group.resources.length);
  }, [resourceQuery, resourcesByCategory]);
  const selectedResources = availableResources.filter((resource) => selectedResourceIds.includes(resource.id)).sort((a, b) => nameCollator.compare(a.name, b.name));
  const availabilityMap = useMemo(() => buildResourceAvailabilityMap(availableResources, usages, editing?.id ?? null), [availableResources, editing?.id, usages]);
  const availableResourceCount = [...availabilityMap.values()].filter((availability) => availability.status === "AVAILABLE").length;
  const assignedResourceCount = [...availabilityMap.values()].filter((availability) => availability.status === "ASSIGNED_TO_OTHER" || availability.status === "ASSIGNED_TO_CURRENT").length;
  const inactiveResourceCount = [...availabilityMap.values()].filter((availability) => availability.status === "INACTIVE").length;

  function showForm(item?: CurrentServiceTeamMember) {
    setEditing(item ?? null);
    setMemberId(item?.team_member_id ?? (item ? "__other" : ""));
    setPersonName(item?.person_name ?? "");
    const knownRole = roles.includes(item?.role_name ?? "");
    setRoleName(item?.role_name ?? "");
    setCustomRole(Boolean(item && !knownRole));
    setSelectedResourceIds(item ? usages.filter((usage) => usage.assignment_id === item.id).map((usage) => usage.resource_id) : []);
    setResourceQuery("");
    const firstSelectedCategory = availableResources.find((resource) => item?.resources.some((selected) => selected.id === resource.id))?.category_id;
    setOpenCategoryId(isMobileViewport() ? "" : firstSelectedCategory ?? resourcesByCategory[0]?.category.id ?? "");
    setOpen(true);
    setMessage("");
  }

  function toggleResource(resource: ServiceResource) {
    const availability = availabilityMap.get(resource.id);
    if (availability?.status === "ASSIGNED_TO_OTHER") {
      setMessage(`Este recurso ya está asignado a ${availability.assignedPersonName}.`);
      return;
    }
    if (availability?.status === "INACTIVE" && !selectedResourceIds.includes(resource.id)) {
      return;
    }
    setSelectedResourceIds((current) => current.includes(resource.id) ? current.filter((id) => id !== resource.id) : [...current, resource.id]);
  }

  async function refreshUsages() {
    const supabase = createSupabaseBrowserClient();
    const [{ data: links, error: linksError }, { data: team, error: teamError }] = await Promise.all([
      supabase.from("service_team_assignment_resources").select("resource_id, assignment_id").eq("service_id", serviceId),
      supabase.from("service_team_assignments").select("id, person_name").eq("service_id", serviceId),
    ]);
    if (linksError || teamError) return false;
    setUsages(joinResourceUsages(links ?? [], team ?? []));
    return true;
  }

  async function refreshTeam() {
    const supabase = createSupabaseBrowserClient();
    const [{ data: team, error: teamError }, { data: links, error: linksError }] = await Promise.all([
      supabase.from("service_team_assignments").select("id, team_member_id, person_name, role_name, microphone_name, sort_order").eq("service_id", serviceId).order("sort_order").order("created_at"),
      supabase.from("service_team_assignment_resources").select("assignment_id, resource_id").eq("service_id", serviceId),
    ]);
    if (teamError || linksError) return false;
    const categoryOrder = new Map(resourceCategories.map((category) => [category.id, category.sort_order]));
    const resourcesById = new Map(availableResources.map((resource) => [resource.id, { categorySortOrder: categoryOrder.get(resource.category_id) ?? Number.MAX_SAFE_INTEGER, id: resource.id, name: resource.name }]));
    setAssignments((team ?? []).map((assignment) => ({
      ...assignment,
      resources: (links ?? []).filter((link) => link.assignment_id === assignment.id).flatMap((link) => {
        const resource = resourcesById.get(link.resource_id);
        return resource ? [resource] : [];
      }),
    })) as CurrentServiceTeamMember[]);
    setUsages(joinResourceUsages(links ?? [], team ?? []));
    return true;
  }

  async function copyTeam() {
    if (!copySourceId || copyBusy) return;
    setCopyBusy(true);
    setCopyError("");
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.rpc("copy_service_team", { p_source_service_id: copySourceId, p_target_service_id: serviceId });
    if (error) {
      setCopyError(error.message);
      setCopyBusy(false);
      return;
    }
    if (!(await refreshTeam())) {
      window.location.reload();
      return;
    }
    setCopyOpen(false);
    setCopyFeedback("Equipo copiado correctamente.");
    setCopyBusy(false);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !personName.trim() || !roleName.trim()) return;
    const conflict = selectedResourceIds.map((resourceId) => availabilityMap.get(resourceId)).find((availability) => availability?.status === "ASSIGNED_TO_OTHER");
    if (conflict) {
      setMessage(`Este recurso ya está asignado a ${conflict.assignedPersonName}.`);
      return;
    }

    setBusy(true);
    const supabase = createSupabaseBrowserClient();
    const values = { team_member_id: memberId && memberId !== "__other" ? memberId : null, person_name: personName.trim(), role_name: roleName.trim(), microphone_name: editing?.microphone_name ?? null, updated_at: new Date().toISOString() };
    const result = editing
      ? await supabase.from("service_team_assignments").update(values).eq("id", editing.id).eq("service_id", serviceId).select("id, team_member_id, person_name, role_name, microphone_name, sort_order").single()
      : await supabase.from("service_team_assignments").insert({ ...values, service_id: serviceId, sort_order: assignments.length }).select("id, team_member_id, person_name, role_name, microphone_name, sort_order").single();

    if (result.error) {
      setMessage(result.error.message);
      setBusy(false);
      return;
    }

    const savedBase = result.data;
    const { error: resourcesError } = await supabase.rpc("set_service_team_assignment_resources", { p_assignment_id: savedBase.id, p_resource_ids: selectedResourceIds });
    if (resourcesError) {
      if (!editing) await supabase.from("service_team_assignments").delete().eq("id", savedBase.id).eq("service_id", serviceId);
      if (resourcesError.code === "23505") {
        setMessage("Este recurso acaba de ser asignado a otra persona. Actualiza la disponibilidad e inténtalo nuevamente.");
        await refreshUsages();
      } else {
        setMessage(resourcesError.message);
      }
      setBusy(false);
      return;
    }

    const categoryOrder = new Map(resourceCategories.map((category) => [category.id, category.sort_order]));
    const selectedResources = availableResources.filter((resource) => selectedResourceIds.includes(resource.id)).map(({ category_id, id, name }) => ({ categorySortOrder: categoryOrder.get(category_id) ?? Number.MAX_SAFE_INTEGER, id, name }));
    const saved: CurrentServiceTeamMember = { ...savedBase, resources: selectedResources };
    setAssignments((current) => editing ? current.map((item) => item.id === saved.id ? saved : item) : [...current, saved]);
    await refreshUsages();
    setOpen(false);
    setMessage("Equipo actualizado.");
    setBusy(false);
  }

  async function remove(id: string, closeForm = false) {
    if (!window.confirm("¿Eliminar esta asignación?")) return;
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.from("service_team_assignments").delete().eq("id", id).eq("service_id", serviceId);
    if (!error) {
      setAssignments((current) => current.filter((item) => item.id !== id));
      await refreshUsages();
      if (closeForm) setOpen(false);
    }
    else setMessage(error.message);
  }

  async function move(index: number, direction: -1 | 1) {
    const otherIndex = index + direction;
    if (otherIndex < 0 || otherIndex >= assignments.length || busy) return;
    setBusy(true);
    const next = [...assignments];
    [next[index], next[otherIndex]] = [next[otherIndex], next[index]];
    const normalized = next.map((item, position) => ({ ...item, sort_order: position }));
    const supabase = createSupabaseBrowserClient();
    const updatedAt = new Date().toISOString();
    const results = await Promise.all(normalized.map((item) => supabase.from("service_team_assignments").update({ sort_order: item.sort_order, updated_at: updatedAt }).eq("id", item.id).eq("service_id", serviceId)));
    if (results.some((result) => result.error)) setMessage("No fue posible cambiar el orden.");
    else setAssignments(normalized);
    setBusy(false);
  }

  return (
    <div className="pb-[calc(6rem+env(safe-area-inset-bottom))] lg:mt-6 lg:pb-0">
      <div className="lg:hidden">
        <Link href={`/admin?service=${serviceId}`} className="inline-flex min-h-9 items-center text-sm font-medium text-zinc-500 transition-colors hover:text-white">‹ Administración</Link>
        <div className="flex items-center justify-between gap-3"><h1 className="min-w-0 truncate text-[1.75rem] font-bold tracking-[-0.035em] text-white">Equipo del servicio</h1><button type="button" onClick={() => showForm()} className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl bg-emerald-400 px-3 text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400">+ Agregar</button></div>
        <p className="mt-1 flex min-w-0 items-center gap-2 text-sm text-zinc-500"><Users aria-hidden="true" className="size-4 shrink-0 text-emerald-400/70" /><span className="truncate">{assignments.length} {assignments.length === 1 ? "persona" : "personas"} · {serviceName}</span></p>
        <nav aria-label="Secciones del servicio" className="-mx-4 mt-2.5 flex h-11 gap-0.5 overflow-x-auto border-y border-white/[0.07] px-4 text-[0.8125rem] font-semibold [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"><Link href={`/service/${serviceId}`} className="flex min-h-11 shrink-0 items-center border-b-2 border-transparent px-2.5 text-zinc-400">Orden</Link><span aria-current="page" className="flex min-h-11 shrink-0 items-center border-b-2 border-emerald-400 px-2.5 text-emerald-300">Equipo</span><Link href={`/admin/resources?service=${serviceId}`} className="flex min-h-11 shrink-0 items-center border-b-2 border-transparent px-2.5 text-zinc-400">Recursos</Link><Link href={`/service/${serviceId}/notes`} className="flex min-h-11 shrink-0 items-center border-b-2 border-transparent px-2.5 text-zinc-400">Notas</Link><Link href={`/service/${serviceId}/rehearsal`} className="flex min-h-11 shrink-0 items-center border-b-2 border-transparent px-2.5 text-zinc-400">Ensayo</Link><Link href={`/service/${serviceId}/report`} className="flex min-h-11 shrink-0 items-center border-b-2 border-transparent px-2.5 text-zinc-400">Reporte</Link></nav>
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row lg:mt-0">
        <PrimaryButton type="button" onClick={() => showForm()} className="hidden min-h-12 rounded-full px-6 text-base lg:inline-flex">+ Agregar persona</PrimaryButton>
        <button type="button" onClick={() => { setCopyError(""); setCopyOpen(true); }} disabled={assignments.length > 0 || !copySources.length} title={assignments.length ? "Este servicio ya tiene un equipo asignado." : !copySources.length ? "No hay servicios anteriores con equipo." : undefined} className="min-h-11 rounded-xl border border-white/10 px-4 text-sm font-semibold text-zinc-300 transition-colors hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-40 lg:min-h-12 lg:rounded-full">Copiar equipo de otro servicio</button>
      </div>
      {copyFeedback ? <p role="status" className="mt-3 text-sm text-emerald-400">{copyFeedback}</p> : null}
      {copyOpen ? <CopyTeamDialog busy={copyBusy} error={copyError} onClose={() => { if (!copyBusy) setCopyOpen(false); }} onConfirm={() => void copyTeam()} onSelect={setCopySourceId} selectedSourceId={copySourceId} sources={copySources} /> : null}
      {open ? (
        <form onSubmit={save} className="mt-3 rounded-2xl border border-white/[0.07] bg-zinc-900/30 p-4 pb-32 md:mt-4 md:p-5">
          <div className="grid gap-3 md:gap-4 lg:grid-cols-2">
            <label className="text-sm font-semibold text-zinc-300">Persona<select value={memberId} onChange={(event) => { const id = event.target.value; setMemberId(id); const member = teamMembers.find((item) => item.id === id); setPersonName(member?.name ?? ""); }} className={`${appFieldStyles} mt-2`}><option value="">Seleccionar persona</option>{teamMembers.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}<option value="__other">Otro nombre...</option></select>{memberId === "__other" ? <input value={personName} onChange={(event) => setPersonName(event.target.value)} placeholder="Nombre" className={`${appFieldStyles} mt-2`} /> : null}</label>
            <label className="text-sm font-semibold text-zinc-300">Función / posición<select value={customRole ? "__other" : roleName} onChange={(event) => { const custom = event.target.value === "__other"; setCustomRole(custom); setRoleName(custom ? "" : event.target.value); }} className={`${appFieldStyles} mt-2`}><option value="">Seleccionar función</option>{roles.map((role) => <option key={role}>{role}</option>)}<option value="__other">Otro...</option></select>{customRole ? <input value={roleName} onChange={(event) => setRoleName(event.target.value)} placeholder="Otra función" className={`${appFieldStyles} mt-2`} /> : null}</label>
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
            <fieldset className="min-w-0">
              <legend className="text-sm font-semibold text-zinc-300">Recursos</legend>
              {selectedResources.length ? (
                <div className="mt-2 border-b border-white/[0.07] pb-3 lg:hidden">
                  <p className="text-xs font-semibold text-zinc-500">Recursos seleccionados</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedResources.map((resource) => <button key={resource.id} type="button" onClick={() => toggleResource(resource)} className="min-h-11 max-w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 text-sm font-medium text-zinc-200 transition-colors duration-200 hover:bg-white/[0.09] focus-visible:outline-2 focus-visible:outline-emerald-400"><span className="break-words">{resource.name}</span><span aria-hidden="true" className="ml-2 text-zinc-500">×</span><span className="sr-only">Quitar {resource.name}</span></button>)}
                  </div>
                </div>
              ) : null}

              <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_11rem] lg:items-end">
                <label className="text-xs font-semibold text-zinc-500"><span className="lg:sr-only">Buscar recursos</span><input type="search" value={resourceQuery} onChange={(event) => { const value = event.target.value; setResourceQuery(value); const normalized = value.trim().toLocaleLowerCase("es"); const firstMatch = resourcesByCategory.find((group) => !normalized || group.category.name.toLocaleLowerCase("es").includes(normalized) || group.resources.some((resource) => resource.name.toLocaleLowerCase("es").includes(normalized))); if (firstMatch && !isMobileViewport()) setOpenCategoryId(firstMatch.category.id); }} placeholder="Buscar recursos..." className={`${appFieldStyles} mt-2 lg:mt-0`} /></label>
                <label className="hidden text-xs font-semibold text-zinc-500 lg:block">Ver<select value="category" disabled className={`${appFieldStyles} mt-2`}><option value="category">Por categoría</option></select></label>
              </div>

              <div className="mt-3 overflow-hidden rounded-2xl border border-white/[0.07]">
                {filteredResourceGroups.length ? filteredResourceGroups.map(({ category, resources }) => {
                  const expanded = openCategoryId === category.id;
                  const availableCount = resources.filter((resource) => availabilityMap.get(resource.id)?.status === "AVAILABLE").length;
                  return (
                    <div key={category.id} className="border-b border-white/[0.06] last:border-b-0">
                      <button type="button" aria-expanded={expanded} onClick={() => setOpenCategoryId((current) => current === category.id ? "" : category.id)} className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left font-semibold text-white transition-colors duration-200 hover:bg-white/[0.04] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-emerald-400">
                        <span className="flex min-w-0 items-center gap-3"><span aria-hidden="true" className="hidden text-zinc-500 md:inline">{expanded ? "▴" : "▾"}</span><span className="truncate text-xs uppercase tracking-[0.14em] md:text-sm">{category.name}</span></span><span className="flex shrink-0 items-center gap-3 text-xs font-normal text-zinc-500 md:gap-5"><span className="hidden md:inline">{resources.length}</span><span>{availableCount} disponibles</span><span aria-hidden="true" className="text-base md:hidden">{expanded ? "⌃" : "›"}</span></span>
                      </button>
                      <div className={`grid transition-[grid-template-rows,opacity] duration-200 ${expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}><div className="overflow-hidden"><div className="divide-y divide-white/[0.06] border-t border-white/[0.06] px-4">
                        {resources.map((resource) => {
                          const availability = availabilityMap.get(resource.id);
                          const checked = selectedResourceIds.includes(resource.id);
                          const assignedToOther = availability?.status === "ASSIGNED_TO_OTHER";
                          const inactive = availability?.status === "INACTIVE";
                          const disabled = assignedToOther || inactive;
                          const status = inactive
                            ? `Inactivo${availability.assignedPersonName ? ` · Asignado a ${availability.assignedPersonName}` : ""}`
                            : assignedToOther
                              ? `Asignado a ${availability.assignedPersonName}`
                              : availability?.status === "ASSIGNED_TO_CURRENT"
                                ? "Seleccionado"
                                : "Disponible";
                          return <label key={resource.id} className={`flex min-h-14 w-full items-center gap-3 px-1 py-2 text-left transition-colors duration-200 ${disabled ? "cursor-not-allowed opacity-55" : "cursor-pointer hover:bg-white/[0.025]"} ${checked ? "bg-white/[0.035]" : ""}`}><input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggleResource(resource)} className="size-5 shrink-0 accent-emerald-500" /><span className="min-w-0 flex-1"><span className="block font-medium text-white">{resource.name}</span><span className="block text-xs text-zinc-500">{status}</span></span><span className="hidden max-w-44 items-center gap-1.5 text-right text-xs text-zinc-500 md:flex">{assignedToOther ? <LockKeyhole aria-hidden="true" className="size-3.5 shrink-0" /> : null}{status}</span></label>;
                        })}
                      </div></div></div>
                    </div>
                  );
                }) : <p className="px-4 py-6 text-center text-sm text-zinc-500">No se encontraron recursos activos.</p>}
              </div>
            </fieldset>

            <DesktopSelectionSidebar availableCount={availableResourceCount} assignedCount={assignedResourceCount} inactiveCount={inactiveResourceCount} categories={resourceCategories} resources={selectedResources} onRemove={toggleResource} />
          </div>

          <div className="mt-5 hidden md:block lg:hidden"><AssignmentSummary personName={personName} roleName={roleName} legacyMicrophone={editing?.microphone_name ?? null} resources={selectedResources} /></div>
          {editing ? <button type="button" onClick={() => void remove(editing.id, true)} className="mt-4 min-h-11 w-full rounded-xl border border-rose-400/20 px-4 text-sm font-semibold text-rose-300 transition-colors duration-200 hover:bg-rose-400/[0.08] md:hidden">Eliminar asignación</button> : null}
          <div className="hidden md:block"><AppActionBar className="mt-5" separated><button type="button" onClick={() => setOpen(false)} className="min-h-12 w-full rounded-2xl px-4 text-zinc-400 transition-colors duration-200 hover:bg-white/[0.05] sm:w-auto">Cancelar</button><div className="flex flex-col gap-2 sm:ml-auto sm:flex-row">{editing ? <button type="button" onClick={() => void remove(editing.id, true)} className="min-h-12 w-full rounded-2xl border border-rose-400/20 px-4 text-sm font-semibold text-rose-300 transition-colors duration-200 hover:bg-rose-400/[0.08] sm:w-auto">Eliminar asignación</button> : null}<PrimaryButton type="submit" disabled={busy || !personName.trim() || !roleName.trim()} className="w-full sm:w-auto">{busy ? "Guardando..." : editing ? "Guardar cambios" : "Guardar"}</PrimaryButton></div></AppActionBar></div>
          <div className="fixed inset-x-0 z-40 border-t border-white/[0.08] bg-zinc-950/95 px-4 py-2.5 shadow-[0_-10px_28px_rgba(0,0,0,0.35)] backdrop-blur-xl md:hidden" style={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom))" }}><div className="mx-auto grid max-w-lg grid-cols-2 gap-3"><button type="button" onClick={() => setOpen(false)} className="min-h-12 rounded-2xl border border-white/10 bg-white/[0.04] px-4 font-semibold text-zinc-300">Cancelar</button><PrimaryButton type="submit" disabled={busy || !personName.trim() || !roleName.trim()} className="w-full">{busy ? "Guardando..." : "Guardar"}</PrimaryButton></div></div>
        </form>
      ) : null}
      <div className="mt-3 divide-y divide-white/[0.07] border-y border-white/[0.07] lg:hidden">
        {assignments.map((item, index) => {
          const resources = uniqueValues([...item.resources.map((resource) => resource.name), item.microphone_name]);
          return (
            <div key={item.id} className="grid items-start gap-x-3 py-4" style={{ gridTemplateColumns: "42px minmax(0, 1fr) 44px" }}>
              <div aria-hidden="true" className="self-start justify-self-start text-xs font-semibold tracking-[0.05em] text-emerald-300" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 38, height: 38, minWidth: 38, maxWidth: 38, minHeight: 38, maxHeight: 38, flexShrink: 0, borderRadius: 9999, backgroundColor: "rgba(16, 185, 129, 0.12)", border: "1px solid rgba(52, 211, 153, 0.24)" }}>{getInitials(item.person_name)}</div>
              <div className="min-w-0 pt-0.5"><p className="truncate text-[0.9375rem] font-semibold leading-5 text-zinc-100">{item.person_name}</p><p className="mt-0.5 truncate text-[0.8125rem] leading-[1.125rem] text-zinc-400">{item.role_name}</p>{resources.length ? <p className="mt-0.5 line-clamp-2 text-xs leading-[1.125rem] text-zinc-400/75">{resources.join(" · ")}</p> : null}</div>
              <details className="relative -mt-0.5 justify-self-end"><summary aria-label={`Acciones para ${item.person_name}`} className="grid size-11 cursor-pointer list-none place-items-center rounded-xl text-lg leading-none text-zinc-500 transition-colors hover:bg-white/[0.05] hover:text-white focus-visible:outline-2 focus-visible:outline-emerald-400 [&::-webkit-details-marker]:hidden">•••</summary><div className="absolute right-0 z-30 mt-1 min-w-44 overflow-hidden rounded-xl border border-white/10 bg-zinc-900 p-1 shadow-xl shadow-black/40"><button type="button" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); showForm(item); }} className={mobileMenuActionStyles}>Editar</button><button type="button" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); void move(index, -1); }} disabled={busy || index === 0} className={mobileMenuActionStyles}>Mover arriba</button><button type="button" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); void move(index, 1); }} disabled={busy || index === assignments.length - 1} className={mobileMenuActionStyles}>Mover abajo</button><button type="button" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); void remove(item.id); }} className={`${mobileMenuActionStyles} text-rose-300`}>Eliminar</button></div></details>
            </div>
          );
        })}
      </div>
      <div className="mt-6 hidden grid-cols-[minmax(160px,1fr)_minmax(120px,0.7fr)_minmax(180px,1.2fr)_auto] gap-4 border-y border-white/[0.07] px-3 py-2 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-zinc-600 lg:grid"><span>Persona</span><span>Función</span><span>Recursos</span><span className="text-right">Acciones</span></div>
      <AppList className="mt-0 hidden border-t-0 lg:block">{assignments.map((item, index) => <AppListRow key={item.id} className="lg:grid lg:min-h-14 lg:grid-cols-[minmax(160px,1fr)_minmax(120px,0.7fr)_minmax(180px,1.2fr)_auto] lg:gap-4 lg:px-3 lg:py-2"><div className="min-w-0 flex-1"><p className="truncate font-semibold text-white">{item.person_name}</p></div><p className="hidden truncate text-sm text-zinc-400 lg:block">{item.role_name || "—"}</p><p className="hidden truncate text-sm text-zinc-500 lg:block" title={[...item.resources.map((resource) => resource.name), item.microphone_name].filter(Boolean).join(" · ")}>{[...item.resources.map((resource) => resource.name), item.microphone_name].filter(Boolean).join(" · ") || "—"}</p><div className="flex flex-wrap gap-1 lg:justify-end"><button type="button" onClick={() => void move(index, -1)} disabled={busy || index === 0} className={appRowActionStyles}>Subir</button><button type="button" onClick={() => void move(index, 1)} disabled={busy || index === assignments.length - 1} className={appRowActionStyles}>Bajar</button><button type="button" onClick={() => showForm(item)} className={appRowActionStyles}>Editar</button><button type="button" onClick={() => void remove(item.id)} className={`${appRowActionStyles} text-rose-300`}>Eliminar</button></div></AppListRow>)}</AppList>
      <p role="status" aria-live="polite" className="mt-4 min-h-5 text-sm text-rose-300">{message}</p>
    </div>
  );
}

function AssignmentSummary({ legacyMicrophone, personName, resources, roleName }: { legacyMicrophone: string | null; personName: string; resources: ServiceResource[]; roleName: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] p-4">
      <h3 className="font-semibold text-white">Resumen</h3>
      <div className="mt-3 space-y-1 text-sm">
        <p className="font-semibold text-zinc-200">{personName.trim() || "Persona sin seleccionar"}</p>
        {roleName.trim() ? <p className="text-zinc-400">{roleName}</p> : null}
        {legacyMicrophone ? <p className="text-zinc-500">{legacyMicrophone} <span className="ml-1 text-xs">(asignación anterior)</span></p> : null}
        {resources.length ? <p className="pt-2 text-zinc-400">{resources.map((resource) => resource.name).join(" • ")}</p> : <p className="pt-2 text-zinc-500">Sin recursos seleccionados</p>}
      </div>
    </div>
  );
}

function CopyTeamDialog({ busy, error, onClose, onConfirm, onSelect, selectedSourceId, sources }: { busy: boolean; error: string; onClose: () => void; onConfirm: () => void; onSelect: (serviceId: number) => void; selectedSourceId: number; sources: TeamCopySource[] }) {
  const source = sources.find((item) => item.serviceId === selectedSourceId) ?? sources[0];
  const people = source ? groupPreviewAssignments(source.assignments) : [];
  const resourceCount = source ? new Set(source.assignments.flatMap((assignment) => assignment.resources.map((resource) => resource.id))).size : 0;
  return <div role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }} className="fixed inset-0 z-[80] flex items-end justify-center bg-black/75 p-3 backdrop-blur-sm sm:items-center"><section role="dialog" aria-modal="true" aria-labelledby="copy-team-title" className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-zinc-900 shadow-2xl shadow-black/60"><header className="border-b border-white/[0.07] p-5"><div className="flex items-start justify-between gap-4"><div><p className="text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-emerald-400">Equipo del servicio</p><h2 id="copy-team-title" className="mt-1 text-xl font-bold text-white">Copiar equipo</h2></div><button type="button" onClick={onClose} disabled={busy} aria-label="Cerrar" className="grid size-10 shrink-0 place-items-center rounded-xl text-zinc-500 hover:bg-white/[0.05] hover:text-white disabled:opacity-40">×</button></div><label className="mt-4 block text-sm font-semibold text-zinc-300">Servicio de origen<select value={source?.serviceId ?? ""} onChange={(event) => onSelect(Number(event.target.value))} disabled={busy} className={`${appFieldStyles} mt-2`}>{sources.map((item) => <option key={item.serviceId} value={item.serviceId}>{formatCopyServiceLabel(item)}</option>)}</select></label></header><div className="min-h-0 overflow-y-auto p-5">{source ? <><div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4"><p className="font-semibold text-white">{localizeServiceName(source.serviceName)}</p><p className="mt-1 text-sm text-zinc-400">{formatSourceSchedule(source)} · {statusLabel(source.status)}</p><p className="mt-2 text-sm text-zinc-300">{people.length} {people.length === 1 ? "persona" : "personas"} · {source.assignments.length} {source.assignments.length === 1 ? "función" : "funciones"} · {resourceCount} {resourceCount === 1 ? "recurso" : "recursos"}</p></div><div className="mt-4 divide-y divide-white/[0.06] border-y border-white/[0.07]">{people.map((person) => <div key={person.key} className="py-3"><p className="font-semibold text-zinc-100">{person.name}</p><p className="mt-1 text-sm leading-6 text-zinc-400">{person.roles.join(" · ")}</p>{person.resources.length ? <p className="mt-0.5 text-xs leading-5 text-zinc-500">{person.resources.join(" · ")}</p> : null}</div>)}</div><div className="mt-5 space-y-1.5 text-xs leading-5 text-zinc-500"><p>Se copiarán las asignaciones y recursos de este servicio al servicio actual.</p><p>Las personas del directorio y los recursos existentes se reutilizan. El servicio de origen no cambia.</p><p>Esta acción no copia el Orden del Servicio.</p></div></> : null}{error ? <p role="alert" className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/[0.07] p-3 text-sm leading-6 text-rose-200">{error}</p> : null}</div><footer className="grid grid-cols-2 gap-3 border-t border-white/[0.07] bg-zinc-950/40 p-4"><button type="button" onClick={onClose} disabled={busy} className="min-h-12 rounded-xl border border-white/10 px-4 text-sm font-semibold text-zinc-300 hover:bg-white/[0.05] disabled:opacity-40">Cancelar</button><PrimaryButton type="button" onClick={onConfirm} disabled={busy || !source} className="w-full">{busy ? "Copiando…" : "Copiar equipo"}</PrimaryButton></footer></section></div>;
}

function groupPreviewAssignments(assignments: CurrentServiceTeamMember[]) {
  const groups = new Map<string, { key: string; name: string; resources: string[]; roles: string[] }>();
  for (const assignment of assignments) {
    const key = assignment.team_member_id ?? assignment.person_name.trim().toLocaleLowerCase("es");
    const group = groups.get(key) ?? { key, name: assignment.person_name, resources: [], roles: [] };
    if (!group.roles.includes(assignment.role_name)) group.roles.push(assignment.role_name);
    for (const resource of uniqueValues([...assignment.resources.map((item) => item.name), assignment.microphone_name])) if (!group.resources.includes(resource)) group.resources.push(resource);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function formatCopyServiceLabel(source: TeamCopySource) { return `${localizeServiceName(source.serviceName)} · ${source.serviceDate ?? "Sin fecha"} · ${source.assignments.length} asignaciones`; }
function formatSourceSchedule(source: TeamCopySource) { return [source.serviceDate ? new Intl.DateTimeFormat("es-419", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${source.serviceDate}T00:00:00Z`)).replaceAll(".", "") : "Fecha pendiente", formatServiceTime(source.serviceTime)].join(" · "); }
function formatServiceTime(value: string) { const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)/); if (!match) return value; const hour = Number(match[1]); return `${hour % 12 || 12}:${match[2]} ${hour >= 12 ? "PM" : "AM"}`; }
function localizeServiceName(value: string) { return value === "Saturday Service" ? "Servicio del Sábado" : value; }
function statusLabel(status: TeamCopySource["status"]) { return { active: "Activo", planned: "Planificado", completed: "Completado", archived: "Archivado" }[status]; }

function DesktopSelectionSidebar({ assignedCount, availableCount, categories, inactiveCount, onRemove, resources }: { assignedCount: number; availableCount: number; categories: ResourceCategory[]; inactiveCount: number; onRemove: (resource: ServiceResource) => void; resources: ServiceResource[] }) {
  const categoryById = new Map(categories.map((category) => [category.id, category.name]));
  return (
    <aside className="sticky top-6 hidden self-start space-y-4 lg:block">
      <div className="rounded-2xl border border-white/[0.07] bg-zinc-950/20 p-4">
        <h3 className="font-semibold text-white">Disponibilidad</h3>
        <div className="mt-4 space-y-4 text-sm">
          <div className="flex gap-3"><span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-emerald-400" /><div><p className="font-medium text-zinc-200">Disponible <span className="ml-1 text-zinc-500">{availableCount}</span></p><p className="mt-0.5 text-xs text-zinc-500">Puede seleccionarse</p></div></div>
          <div className="flex gap-3"><span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-zinc-500" /><div><p className="font-medium text-zinc-200">Asignado <span className="ml-1 text-zinc-500">{assignedCount}</span></p><p className="mt-0.5 text-xs text-zinc-500">Ya está asignado a otra persona</p></div></div>
          <div className="flex gap-3"><span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-zinc-700" /><div><p className="font-medium text-zinc-200">Inactivo <span className="ml-1 text-zinc-500">{inactiveCount}</span></p><p className="mt-0.5 text-xs text-zinc-500">Recurso inactivo</p></div></div>
        </div>
      </div>
      <div className="rounded-2xl border border-white/[0.07] bg-zinc-950/20 p-4">
        <div className="flex items-baseline justify-between gap-3"><h3 className="font-semibold text-white">Resumen de selección</h3><span className="text-xs text-zinc-500">{resources.length} seleccionados</span></div>
        {resources.length ? <div className="mt-3 divide-y divide-white/[0.06]">{resources.map((resource) => <div key={resource.id} className="flex min-h-14 items-center gap-3 py-2"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-zinc-200">{resource.name}</p><p className="mt-0.5 text-xs text-zinc-500">{categoryById.get(resource.category_id)}</p></div><button type="button" onClick={() => onRemove(resource)} className="grid size-11 shrink-0 place-items-center rounded-xl text-zinc-500 transition-colors duration-200 hover:bg-white/[0.06] hover:text-white focus-visible:outline-2 focus-visible:outline-emerald-400"><span aria-hidden="true">×</span><span className="sr-only">Quitar {resource.name}</span></button></div>)}</div> : <p className="mt-4 text-sm text-zinc-500">Sin recursos seleccionados</p>}
      </div>
    </aside>
  );
}

function isMobileViewport() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part.charAt(0)).join("").toLocaleUpperCase("es") || "—";
}

function uniqueValues(values: Array<string | null>) {
  return values.flatMap((value) => value?.trim() ? [value.trim()] : []).filter((value, index, all) => all.indexOf(value) === index);
}

const mobileMenuActionStyles = "min-h-11 w-full rounded-lg px-3 text-left text-sm font-medium text-zinc-200 transition-colors hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-emerald-400";
