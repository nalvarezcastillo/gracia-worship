"use client";

import { useMemo, useState } from "react";
import { AppActionBar } from "@/components/app-action-bar";
import { AppEmptyState } from "@/components/app-empty-state";
import { AppSearch } from "@/components/app-search";
import { AppSectionCard } from "@/components/app-section-card";
import { AppStatusBadge } from "@/components/app-status-badge";
import { PrimaryButton, SecondaryButton } from "@/components/ui/action-button";
import { appFieldStyles, appRowActionStyles } from "@/components/ui/styles";
import type { ResourceCategory, ResourceUsage, ServiceResource } from "@/lib/resources";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

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
        <AppSearch className="min-w-0 flex-1" label="Buscar recursos" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nombre o categoría" />
        <PrimaryButton type="button" onClick={() => openForm()} disabled={!initialCategories.length} className="w-full sm:w-auto">Agregar recurso</PrimaryButton>
      </div>

      {showForm ? (
        <form onSubmit={save} className="mt-4 grid gap-4 rounded-2xl border border-white/[0.07] bg-zinc-900/40 p-4 sm:grid-cols-2">
          <label className="text-sm font-semibold text-zinc-300">Nombre<input autoFocus required value={name} onChange={(event) => setName(event.target.value)} className={`${appFieldStyles} mt-2`} /></label>
          <label className="text-sm font-semibold text-zinc-300">Categoría<select required value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className={`${appFieldStyles} mt-2`}>{initialCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <label className="text-sm font-semibold text-zinc-300 sm:col-span-2">Notas<textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} className={`${appFieldStyles} mt-2 resize-y py-3`} /></label>
          <AppActionBar className="sm:col-span-2"><PrimaryButton type="submit" disabled={busyId !== null}>{busyId ? "Guardando..." : "Guardar"}</PrimaryButton><SecondaryButton type="button" onClick={() => setShowForm(false)}>Cancelar</SecondaryButton></AppActionBar>
        </form>
      ) : null}

      <div className="lg:grid lg:grid-cols-2 lg:gap-x-5">
      {visibleByCategory.map(({ category, items }) => (
        <AppSectionCard key={category.id} eyebrow="Categoría" title={category.name} className="lg:mt-5 lg:rounded-xl lg:border-t lg:bg-transparent lg:shadow-none">
          {items.length ? (
            <div className="divide-y divide-white/[0.06] px-4 sm:px-6">
              {items.map((resource) => (
                <div key={resource.id} className={`py-3 sm:py-4 lg:py-2.5 ${resource.active ? "" : "opacity-60"}`}>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <div className="min-w-0">
                      <p className="break-words font-semibold text-white">{resource.name}</p>
                      {resource.notes ? <p className="mt-1 whitespace-pre-wrap break-words text-sm text-zinc-400">{resource.notes}</p> : null}
                      <div className="mt-2"><AppStatusBadge variant={resource.active && !usageByResourceId.has(resource.id) ? "success" : "neutral"}>{!resource.active ? "Inactivo" : usageByResourceId.has(resource.id) ? `Asignado a ${usageByResourceId.get(resource.id)?.person_name}` : "Disponible"}</AppStatusBadge></div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <button type="button" onClick={() => openForm(resource)} className={appRowActionStyles}>Editar</button>
                      <button type="button" onClick={() => void setActive(resource, !resource.active)} disabled={busyId !== null} className={appRowActionStyles}>{resource.active ? "Desactivar" : "Reactivar"}</button>
                      <button type="button" onClick={() => void remove(resource)} disabled={busyId !== null} className={`${appRowActionStyles} text-rose-300`}>Eliminar</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : <AppEmptyState className="px-5 sm:px-6">No hay recursos en esta categoría.</AppEmptyState>}
        </AppSectionCard>
      ))}
      </div>

      {query.trim() && visibleByCategory.length === 0 ? <AppEmptyState>No se encontraron recursos.</AppEmptyState> : null}
      <p role="status" aria-live="polite" className={`mt-4 min-h-5 text-sm ${isError ? "text-rose-300" : "text-emerald-400"}`}>{message}</p>
    </div>
  );
}
