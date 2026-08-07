"use client";

import { useMemo, useState } from "react";
import { AppSectionCard } from "@/components/app-section-card";
import { PrimaryButton, SecondaryButton } from "@/components/ui/action-button";
import type { ResourceCategory, ResourceUsage, ServiceResource } from "@/lib/resources";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const inputStyles = "mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-base text-white outline-none transition-colors duration-200 focus:border-emerald-400/50 focus:ring-4 focus:ring-emerald-400/[0.07]";
const actionStyles = "min-h-11 rounded-xl px-3 text-sm font-semibold text-zinc-400 transition-colors duration-200 hover:bg-white/[0.05] hover:text-white focus-visible:outline-2 focus-visible:outline-emerald-400 disabled:cursor-not-allowed disabled:opacity-40";
const nameCollator = new Intl.Collator("es", { sensitivity: "base" });

type ManageResourcesProps = {
  initialCategories: ResourceCategory[];
  initialResources: ServiceResource[];
  initialUsages: ResourceUsage[];
  loadError: string | null;
};

export function ManageResources({ initialCategories, initialResources, initialUsages, loadError }: ManageResourcesProps) {
  const [resources, setResources] = useState(initialResources);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<ServiceResource | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState(initialCategories[0]?.id ?? "");
  const [notes, setNotes] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState(loadError ?? "");
  const [isError, setIsError] = useState(Boolean(loadError));
  const usageByResourceId = useMemo(() => new Map(initialUsages.map((usage) => [usage.resource_id, usage])), [initialUsages]);
  const activeCount = resources.filter((resource) => resource.active).length;
  const assignedCount = resources.filter((resource) => resource.active && usageByResourceId.has(resource.id)).length;

  const visibleByCategory = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("es");
    return initialCategories.map((category) => {
      const categoryMatches = category.name.toLocaleLowerCase("es").includes(normalizedQuery);
      const items = resources
        .filter((resource) => resource.category_id === category.id)
        .filter((resource) => !normalizedQuery || categoryMatches || resource.name.toLocaleLowerCase("es").includes(normalizedQuery))
        .sort((a, b) => Number(b.active) - Number(a.active) || nameCollator.compare(a.name, b.name));
      return { category, items, visible: !normalizedQuery || categoryMatches || items.length > 0 };
    }).filter((group) => group.visible);
  }, [initialCategories, query, resources]);

  function openForm(resource?: ServiceResource, suggestedCategoryId?: string) {
    setEditing(resource ?? null);
    setName(resource?.name ?? "");
    setCategoryId(resource?.category_id ?? suggestedCategoryId ?? initialCategories[0]?.id ?? "");
    setNotes(resource?.notes ?? "");
    setShowForm(true);
    setMessage("");
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || !categoryId || busyId) return;
    setBusyId(editing?.id ?? "new");
    const supabase = createSupabaseBrowserClient();
    const payload = { name: name.trim(), category_id: categoryId, notes: notes.trim() || null };
    const result = editing
      ? await supabase.from("resources").update(payload).eq("id", editing.id).select("id, name, category_id, active, notes, created_at").single()
      : await supabase.from("resources").insert(payload).select("id, name, category_id, active, notes, created_at").single();

    if (result.error) {
      setIsError(true);
      setMessage(result.error.code === "23505" ? "Ya existe un recurso con ese nombre en esta categoría." : result.error.message);
    } else {
      const saved = result.data as ServiceResource;
      setResources((current) => editing ? current.map((resource) => resource.id === saved.id ? saved : resource) : [...current, saved]);
      setShowForm(false);
      setEditing(null);
      setIsError(false);
      setMessage(editing ? "Recurso actualizado." : "Recurso agregado.");
    }
    setBusyId(null);
  }

  async function setActive(resource: ServiceResource, active: boolean) {
    setBusyId(resource.id);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.from("resources").update({ active }).eq("id", resource.id);
    if (error) {
      setIsError(true);
      setMessage(error.message);
    } else {
      setResources((current) => current.map((item) => item.id === resource.id ? { ...item, active } : item));
      setIsError(false);
      setMessage(active ? "Recurso reactivado." : "Recurso desactivado.");
    }
    setBusyId(null);
  }

  async function remove(resource: ServiceResource) {
    if (!window.confirm(`¿Eliminar ${resource.name}?`)) return;
    setBusyId(resource.id);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.from("resources").delete().eq("id", resource.id);
    if (error) {
      setIsError(true);
      setMessage(error.code === "23503" ? "No se puede eliminar este recurso porque ya fue utilizado. Puedes desactivarlo." : error.message);
    } else {
      setResources((current) => current.filter((item) => item.id !== resource.id));
      setIsError(false);
      setMessage("Recurso eliminado.");
    }
    setBusyId(null);
  }

  return (
    <div className="mt-6">
      <div className="mb-6 flex flex-wrap gap-x-6 gap-y-2 border-y border-white/[0.07] py-3 text-sm text-zinc-400"><span><strong className="font-semibold text-white">{activeCount}</strong> activos</span><span><strong className="font-semibold text-white">{assignedCount}</strong> asignados</span><span><strong className="font-semibold text-white">{activeCount - assignedCount}</strong> disponibles</span></div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <label className="min-w-0 flex-1 text-sm font-semibold text-zinc-300">
          Buscar recursos
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nombre o categoría" className={inputStyles} />
        </label>
        <PrimaryButton type="button" onClick={() => openForm()} disabled={!initialCategories.length} className="w-full sm:w-auto">Agregar recurso</PrimaryButton>
      </div>

      {showForm ? (
        <form onSubmit={save} className="mt-4 grid gap-4 rounded-2xl border border-white/[0.07] bg-zinc-900/40 p-4 sm:grid-cols-2">
          <label className="text-sm font-semibold text-zinc-300">Nombre<input autoFocus required value={name} onChange={(event) => setName(event.target.value)} className={inputStyles} /></label>
          <label className="text-sm font-semibold text-zinc-300">Categoría<select required value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className={inputStyles}>{initialCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <label className="text-sm font-semibold text-zinc-300 sm:col-span-2">Notas<textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} className={`${inputStyles} resize-y py-3`} /></label>
          <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row"><PrimaryButton type="submit" disabled={busyId !== null}>{busyId ? "Guardando..." : "Guardar"}</PrimaryButton><SecondaryButton type="button" onClick={() => setShowForm(false)}>Cancelar</SecondaryButton></div>
        </form>
      ) : null}

      <div className="lg:grid lg:grid-cols-2 lg:gap-x-6">
      {visibleByCategory.map(({ category, items }) => (
        <AppSectionCard key={category.id} eyebrow="Categoría" title={category.name}>
          {items.length ? (
            <div className="divide-y divide-white/[0.06] px-4 sm:px-6">
              {items.map((resource) => (
                <div key={resource.id} className={`py-3 sm:py-4 ${resource.active ? "" : "opacity-60"}`}>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <div className="min-w-0">
                      <p className="break-words font-semibold text-white">{resource.name}</p>
                      {resource.notes ? <p className="mt-1 whitespace-pre-wrap break-words text-sm text-zinc-400">{resource.notes}</p> : null}
                      <p className="mt-1 text-xs font-medium text-zinc-500">{!resource.active ? "Inactivo" : usageByResourceId.has(resource.id) ? `Asignado a ${usageByResourceId.get(resource.id)?.person_name}` : "Disponible"}</p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <button type="button" onClick={() => openForm(resource)} className={actionStyles}>Editar</button>
                      <button type="button" onClick={() => void setActive(resource, !resource.active)} disabled={busyId !== null} className={actionStyles}>{resource.active ? "Desactivar" : "Reactivar"}</button>
                      <button type="button" onClick={() => void remove(resource)} disabled={busyId !== null} className={`${actionStyles} text-rose-300`}>Eliminar</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="px-5 py-5 text-sm text-zinc-500 sm:px-6">No hay recursos en esta categoría.</p>}
        </AppSectionCard>
      ))}
      </div>

      {query.trim() && visibleByCategory.length === 0 ? <p className="py-8 text-center text-sm text-zinc-500">No se encontraron recursos.</p> : null}
      <p role="status" aria-live="polite" className={`mt-4 min-h-5 text-sm ${isError ? "text-rose-300" : "text-emerald-400"}`}>{message}</p>
    </div>
  );
}
