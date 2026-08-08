"use client";

import { useMemo, useState } from "react";
import { LockKeyhole } from "lucide-react";
import { AppActionBar } from "@/components/app-action-bar";
import { AppList, AppListRow } from "@/components/app-list";
import { PrimaryButton } from "@/components/ui/action-button";
import type { CurrentServiceTeamMember } from "@/lib/current-service-team";
import { buildResourceAvailabilityMap, joinResourceUsages } from "@/lib/resource-availability";
import type { ResourceCategory, ResourceUsage, ServiceResource } from "@/lib/resources";
import type { TeamMember } from "@/lib/team";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { appFieldStyles, appRowActionStyles } from "@/components/ui/styles";

const roles = ["Voz", "Piano", "Teclados", "Guitarra Eléctrica", "Guitarra Acústica", "Bajo", "Batería", "Director", "Producción", "Audio", "Luces", "Cámara", "Streaming", "Multimedia", "Tracks", "Playback", "Predicación"];
const nameCollator = new Intl.Collator("es", { sensitivity: "base" });

type Props = {
  availableResources: ServiceResource[];
  initialAssignments: CurrentServiceTeamMember[];
  initialUsages: ResourceUsage[];
  resourceCategories: ResourceCategory[];
  teamMembers: TeamMember[];
};

export function ManageCurrentServiceTeam({ availableResources, initialAssignments, initialUsages, resourceCategories, teamMembers }: Props) {
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
    setSelectedResourceIds(item ? usages.filter((usage) => usage.service_team_id === item.id).map((usage) => usage.resource_id) : []);
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
      supabase.from("current_service_team_resources").select("resource_id, service_team_id"),
      supabase.from("current_service_team").select("id, person_name"),
    ]);
    if (linksError || teamError) return false;
    setUsages(joinResourceUsages(links ?? [], team ?? []));
    return true;
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
    const values = { team_member_id: memberId && memberId !== "__other" ? memberId : null, person_name: personName.trim(), role_name: roleName.trim(), microphone_name: editing?.microphone_name ?? null };
    const result = editing
      ? await supabase.from("current_service_team").update(values).eq("id", editing.id).select("id, team_member_id, person_name, role_name, microphone_name, sort_order").single()
      : await supabase.from("current_service_team").insert({ ...values, sort_order: assignments.length }).select("id, team_member_id, person_name, role_name, microphone_name, sort_order").single();

    if (result.error) {
      setMessage(result.error.message);
      setBusy(false);
      return;
    }

    const savedBase = result.data;
    const { error: resourcesError } = await supabase.rpc("set_current_service_team_resources", { target_service_team_id: savedBase.id, target_resource_ids: selectedResourceIds });
    if (resourcesError) {
      if (!editing) await supabase.from("current_service_team").delete().eq("id", savedBase.id);
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
    const { error } = await supabase.from("current_service_team").delete().eq("id", id);
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
    const results = await Promise.all(normalized.map((item) => supabase.from("current_service_team").update({ sort_order: item.sort_order }).eq("id", item.id)));
    if (results.some((result) => result.error)) setMessage("No fue posible cambiar el orden.");
    else setAssignments(normalized);
    setBusy(false);
  }

  return (
    <div className="mt-6">
      <PrimaryButton type="button" onClick={() => showForm()} className="min-h-11 rounded-xl px-4 text-sm shadow-none hover:translate-y-0 hover:shadow-none active:scale-100 md:min-h-12 md:rounded-full md:px-6 md:text-base">+ Agregar persona</PrimaryButton>
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
      <AppList className="mt-6">{assignments.map((item, index) => <AppListRow key={item.id}><div className="min-w-0 flex-1"><p className="font-semibold text-white">{item.person_name}</p><p className="mt-1 text-sm text-zinc-400">{[item.role_name, item.microphone_name].filter(Boolean).join(" • ")}</p>{item.resources.length ? <p className="mt-1 text-sm text-zinc-500">{item.resources.map((resource) => resource.name).join(" • ")}</p> : null}</div><div className="flex flex-wrap gap-1"><button type="button" onClick={() => void move(index, -1)} disabled={busy || index === 0} className={appRowActionStyles}>Subir</button><button type="button" onClick={() => void move(index, 1)} disabled={busy || index === assignments.length - 1} className={appRowActionStyles}>Bajar</button><button type="button" onClick={() => showForm(item)} className={appRowActionStyles}>Editar</button><button type="button" onClick={() => void remove(item.id)} className={`${appRowActionStyles} text-rose-300`}>Eliminar</button></div></AppListRow>)}</AppList>
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
