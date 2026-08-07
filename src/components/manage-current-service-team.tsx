"use client";

import { useMemo, useState } from "react";
import { LockKeyhole } from "lucide-react";
import { PrimaryButton } from "@/components/ui/action-button";
import type { CurrentServiceTeamMember } from "@/lib/current-service-team";
import type { ResourceCategory, ServiceResource } from "@/lib/resources";
import type { TeamMember } from "@/lib/team";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const roles = ["Voz", "Piano", "Teclados", "Guitarra Eléctrica", "Guitarra Acústica", "Bajo", "Batería", "Director", "Producción", "Audio", "Luces", "Cámara", "Streaming", "Multimedia", "Tracks", "Playback", "Predicación"];
const fieldStyles = "min-h-12 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-white outline-none focus:border-emerald-400/50";
const actionStyles = "min-h-11 rounded-xl px-3 text-sm font-semibold text-zinc-400 hover:bg-white/[0.05] disabled:opacity-40";
const nameCollator = new Intl.Collator("es", { sensitivity: "base" });

type Props = {
  availableResources: ServiceResource[];
  initialAssignments: CurrentServiceTeamMember[];
  resourceCategories: ResourceCategory[];
  teamMembers: TeamMember[];
};

export function ManageCurrentServiceTeam({ availableResources, initialAssignments, resourceCategories, teamMembers }: Props) {
  const [assignments, setAssignments] = useState(initialAssignments);
  const [editing, setEditing] = useState<CurrentServiceTeamMember | null>(null);
  const [open, setOpen] = useState(false);
  const [memberId, setMemberId] = useState("");
  const [personName, setPersonName] = useState("");
  const [roleName, setRoleName] = useState("");
  const [customRole, setCustomRole] = useState(false);
  const [selectedResourceIds, setSelectedResourceIds] = useState<string[]>([]);
  const [resourceQuery, setResourceQuery] = useState("");
  const [openCategoryId, setOpenCategoryId] = useState(resourceCategories[0]?.id ?? "");
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
  const assignedResourceCount = availableResources.filter((resource) => resource.active && assignments.some((assignment) => assignment.id !== editing?.id && assignment.resources.some((assigned) => assigned.id === resource.id))).length;
  const activeResourceCount = availableResources.filter((resource) => resource.active).length;
  const inactiveResourceCount = availableResources.length - activeResourceCount;

  function showForm(item?: CurrentServiceTeamMember) {
    setEditing(item ?? null);
    setMemberId(item?.team_member_id ?? (item ? "__other" : ""));
    setPersonName(item?.person_name ?? "");
    const knownRole = roles.includes(item?.role_name ?? "");
    setRoleName(item?.role_name ?? "");
    setCustomRole(Boolean(item && !knownRole));
    setSelectedResourceIds(item?.resources.map((resource) => resource.id) ?? []);
    setResourceQuery("");
    const firstSelectedCategory = availableResources.find((resource) => item?.resources.some((selected) => selected.id === resource.id))?.category_id;
    setOpenCategoryId(firstSelectedCategory ?? resourcesByCategory[0]?.category.id ?? "");
    setOpen(true);
    setMessage("");
  }

  function resourceOwner(resourceId: string) {
    return assignments.find((assignment) => assignment.id !== editing?.id && assignment.resources.some((resource) => resource.id === resourceId));
  }

  function toggleResource(resource: ServiceResource) {
    const owner = resourceOwner(resource.id);
    if (owner) {
      setMessage(`Este recurso ya está asignado a ${owner.person_name}.`);
      return;
    }
    setSelectedResourceIds((current) => current.includes(resource.id) ? current.filter((id) => id !== resource.id) : [...current, resource.id]);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !personName.trim() || !roleName.trim()) return;
    const conflict = selectedResourceIds.map(resourceOwner).find(Boolean);
    if (conflict) {
      setMessage(`Este recurso ya está asignado a ${conflict.person_name}.`);
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
      const conflictOwner = assignments.find((assignment) => assignment.resources.some((resource) => selectedResourceIds.includes(resource.id)));
      setMessage(resourcesError.code === "23505" ? `Este recurso ya está asignado${conflictOwner ? ` a ${conflictOwner.person_name}` : " a otra persona"}.` : resourcesError.message);
      setBusy(false);
      return;
    }

    const selectedResources = availableResources.filter((resource) => selectedResourceIds.includes(resource.id)).map(({ id, name }) => ({ id, name }));
    const saved: CurrentServiceTeamMember = { ...savedBase, resources: selectedResources };
    setAssignments((current) => editing ? current.map((item) => item.id === saved.id ? saved : item) : [...current, saved]);
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
      <PrimaryButton type="button" onClick={() => showForm()}>+ Agregar persona</PrimaryButton>
      {open ? (
        <form onSubmit={save} className="mt-4 rounded-2xl border border-white/[0.07] bg-zinc-900/30 p-4 sm:p-5">
          <div className="grid gap-4 lg:grid-cols-2">
            <label className="text-sm font-semibold text-zinc-300">Persona<select value={memberId} onChange={(event) => { const id = event.target.value; setMemberId(id); const member = teamMembers.find((item) => item.id === id); setPersonName(member?.name ?? ""); }} className={`mt-2 ${fieldStyles}`}><option value="">Seleccionar persona</option>{teamMembers.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}<option value="__other">Otro nombre...</option></select>{memberId === "__other" ? <input value={personName} onChange={(event) => setPersonName(event.target.value)} placeholder="Nombre" className={`mt-2 ${fieldStyles}`} /> : null}</label>
            <label className="text-sm font-semibold text-zinc-300">Función / posición<select value={customRole ? "__other" : roleName} onChange={(event) => { const custom = event.target.value === "__other"; setCustomRole(custom); setRoleName(custom ? "" : event.target.value); }} className={`mt-2 ${fieldStyles}`}><option value="">Seleccionar función</option>{roles.map((role) => <option key={role}>{role}</option>)}<option value="__other">Otro...</option></select>{customRole ? <input value={roleName} onChange={(event) => setRoleName(event.target.value)} placeholder="Otra función" className={`mt-2 ${fieldStyles}`} /> : null}</label>
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
                <label className="text-xs font-semibold text-zinc-500"><span className="lg:sr-only">Buscar recursos</span><input type="search" value={resourceQuery} onChange={(event) => { const value = event.target.value; setResourceQuery(value); const normalized = value.trim().toLocaleLowerCase("es"); const firstMatch = resourcesByCategory.find((group) => !normalized || group.category.name.toLocaleLowerCase("es").includes(normalized) || group.resources.some((resource) => resource.name.toLocaleLowerCase("es").includes(normalized))); if (firstMatch) setOpenCategoryId(firstMatch.category.id); }} placeholder="Buscar recursos..." className={`mt-2 lg:mt-0 ${fieldStyles}`} /></label>
                <label className="hidden text-xs font-semibold text-zinc-500 lg:block">Ver<select value="category" disabled className={`mt-2 ${fieldStyles}`}><option value="category">Por categoría</option></select></label>
              </div>

              <div className="mt-3 overflow-hidden rounded-2xl border border-white/[0.07]">
                {filteredResourceGroups.length ? filteredResourceGroups.map(({ category, resources }) => {
                  const expanded = openCategoryId === category.id;
                  const availableCount = resources.filter((resource) => resource.active && !resourceOwner(resource.id)).length;
                  return (
                    <div key={category.id} className="border-b border-white/[0.06] last:border-b-0">
                      <button type="button" aria-expanded={expanded} onClick={() => setOpenCategoryId((current) => current === category.id ? "" : category.id)} className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left font-semibold text-white transition-colors duration-200 hover:bg-white/[0.04] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-emerald-400">
                        <span className="flex min-w-0 items-center gap-3"><span aria-hidden="true" className="text-zinc-500">{expanded ? "▴" : "▾"}</span><span className="truncate text-xs uppercase tracking-[0.14em] sm:text-sm">{category.name}</span></span><span className="flex shrink-0 items-center gap-3 text-xs font-normal text-zinc-500 sm:gap-5"><span>{resources.length}</span><span>{availableCount} disponibles</span></span>
                      </button>
                      <div className={`grid transition-[grid-template-rows,opacity] duration-200 ${expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}><div className="overflow-hidden"><div className="divide-y divide-white/[0.06] border-t border-white/[0.06] px-4">
                        {resources.map((resource) => {
                          const owner = resourceOwner(resource.id);
                          const checked = selectedResourceIds.includes(resource.id);
                          const disabled = Boolean(owner) || !resource.active;
                          const status = !resource.active ? "Inactivo" : owner ? `Asignado a ${owner.person_name}` : "Disponible";
                          return <label key={resource.id} className={`flex min-h-14 w-full items-center gap-3 px-1 py-2 text-left transition-colors duration-200 ${disabled ? "cursor-not-allowed opacity-55" : "cursor-pointer hover:bg-white/[0.025]"} ${checked ? "bg-white/[0.035]" : ""}`}><input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggleResource(resource)} className="size-5 shrink-0 accent-emerald-500" /><span className="min-w-0 flex-1"><span className="block font-medium text-white">{resource.name}</span><span className="block text-xs text-zinc-500">{status}</span></span><span className="hidden max-w-44 items-center gap-1.5 text-right text-xs text-zinc-500 sm:flex">{owner ? <LockKeyhole aria-hidden="true" className="size-3.5 shrink-0" /> : null}{checked ? "Seleccionado" : status}</span></label>;
                        })}
                      </div></div></div>
                    </div>
                  );
                }) : <p className="px-4 py-6 text-center text-sm text-zinc-500">No se encontraron recursos activos.</p>}
              </div>
            </fieldset>

            <DesktopSelectionSidebar availableCount={activeResourceCount - assignedResourceCount} assignedCount={assignedResourceCount} inactiveCount={inactiveResourceCount} categories={resourceCategories} resources={selectedResources} onRemove={toggleResource} />
          </div>

          <div className="mt-5 lg:hidden"><AssignmentSummary personName={personName} roleName={roleName} legacyMicrophone={editing?.microphone_name ?? null} resources={selectedResources} /></div>
          <div className="mt-5 flex flex-col gap-2 border-t border-white/[0.07] pt-4 sm:flex-row sm:items-center"><button type="button" onClick={() => setOpen(false)} className="min-h-12 w-full rounded-2xl px-4 text-zinc-400 transition-colors duration-200 hover:bg-white/[0.05] sm:w-auto">Cancelar</button><div className="flex flex-col gap-2 sm:ml-auto sm:flex-row">{editing ? <button type="button" onClick={() => void remove(editing.id, true)} className="min-h-12 w-full rounded-2xl border border-rose-400/20 px-4 text-sm font-semibold text-rose-300 transition-colors duration-200 hover:bg-rose-400/[0.08] sm:w-auto">Eliminar asignación</button> : null}<PrimaryButton type="submit" disabled={busy || !personName.trim() || !roleName.trim()} className="w-full sm:w-auto">{busy ? "Guardando..." : editing ? "Guardar cambios" : "Guardar"}</PrimaryButton></div></div>
        </form>
      ) : null}
      <div className="mt-6 divide-y divide-white/[0.07] border-y border-white/[0.07]">
        {assignments.map((item, index) => <div key={item.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="font-semibold text-white">{item.person_name}</p><p className="mt-1 text-sm text-zinc-400">{[item.role_name, item.microphone_name].filter(Boolean).join(" • ")}</p>{item.resources.length ? <p className="mt-1 text-sm text-zinc-500">{item.resources.map((resource) => resource.name).join(" • ")}</p> : null}</div><div className="flex flex-wrap gap-1"><button type="button" onClick={() => void move(index, -1)} disabled={busy || index === 0} className={actionStyles}>Subir</button><button type="button" onClick={() => void move(index, 1)} disabled={busy || index === assignments.length - 1} className={actionStyles}>Bajar</button><button type="button" onClick={() => showForm(item)} className={actionStyles}>Editar</button><button type="button" onClick={() => void remove(item.id)} className={`${actionStyles} text-rose-300`}>Eliminar</button></div></div>)}
      </div>
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
