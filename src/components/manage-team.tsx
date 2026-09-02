"use client";

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal, Pencil, Plus, X } from "lucide-react";
import { AppActionBar } from "@/components/app-action-bar";
import { AppEmptyState } from "@/components/app-empty-state";
import { AppList, AppListRow } from "@/components/app-list";
import { AppStatusBadge } from "@/components/app-status-badge";
import { PrimaryButton } from "@/components/ui/action-button";
import { SearchField } from "@/components/ui/search-field";
import { appFieldStyles, appFocusStyles, appRowActionStyles } from "@/components/ui/styles";
import type { TeamMember } from "@/lib/team";
import { normalizeSongIds } from "@/lib/service-item-normalization";
import { parseAssignmentText } from "@/lib/assignment-text";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const nameCollator = new Intl.Collator("es", { sensitivity: "base" });

export function ManageTeam({ initialMembers }: { initialMembers: TeamMember[] }) {
  const [members, setMembers] = useState(initialMembers);
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [search, setSearch] = useState("");

  function openForm(member?: TeamMember) { setEditing(member ?? null); setName(member?.name ?? ""); setShowForm(true); setMessage(""); }
  function closeForm() { if (!busyId) setShowForm(false); }

  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!name.trim() || busyId) return;
    setBusyId(editing?.id ?? "new");
    const supabase = createSupabaseBrowserClient();
    const result = editing
      ? await supabase.from("team_members").update({ name: name.trim() }).eq("id", editing.id).select("id, name, instrument, active, sort_order").single()
      : await supabase.from("team_members").insert({ name: name.trim(), sort_order: members.length }).select("id, name, instrument, active, sort_order").single();
    if (result.error) { setIsError(true); setMessage(result.error.code === "23505" ? "Ya existe una persona con ese nombre." : result.error.message); }
    else { const saved = result.data as TeamMember; setMembers((current) => editing ? current.map((item) => item.id === saved.id ? saved : item) : [...current, saved]); setShowForm(false); setIsError(false); setMessage(editing ? "Nombre actualizado." : "Persona agregada al equipo."); }
    setBusyId(null);
  }

  async function setActive(member: TeamMember, active: boolean) {
    setBusyId(member.id); const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.from("team_members").update({ active }).eq("id", member.id);
    if (!error) setMembers((current) => current.map((item) => item.id === member.id ? { ...item, active } : item));
    setBusyId(null);
  }

  async function remove(member: TeamMember) {
    setBusyId(member.id); const supabase = createSupabaseBrowserClient();
    const [{ data: assignments }, { data: serviceItems }] = await Promise.all([supabase.from("microphone_assignments").select("leader_name"), supabase.from("service_items").select("details, song_ids")]);
    const used = (assignments ?? []).some((item) => parseAssignmentText(item.leader_name).name === member.name) || (serviceItems ?? []).some((item) => parseAssignmentText(item.details ?? "").name === member.name || normalizeSongIds(item.song_ids).entries.some((entry) => parseAssignmentText(entry.notes).name === member.name));
    if (used) { setIsError(true); setMessage("No se puede eliminar esta persona. Puedes desactivarla."); setBusyId(null); return; }
    const { error } = await supabase.from("team_members").delete().eq("id", member.id);
    if (error) { setIsError(true); setMessage("No se puede eliminar esta persona. Puedes desactivarla."); }
    else { setMembers((current) => current.filter((item) => item.id !== member.id)); setIsError(false); setMessage("Persona eliminada."); }
    setBusyId(null);
  }

  const activeMembers = members.filter((member) => member.active).sort((a, b) => nameCollator.compare(a.name, b.name));
  const inactiveMembers = members.filter((member) => !member.active).sort((a, b) => nameCollator.compare(a.name, b.name));
  const normalizedSearch = search.trim().toLocaleLowerCase("es");
  const matchesSearch = (member: TeamMember) => !normalizedSearch || `${member.name} ${member.instrument ?? ""}`.toLocaleLowerCase("es").includes(normalizedSearch);
  const visibleActiveMembers = activeMembers.filter(matchesSearch);
  const visibleInactiveMembers = inactiveMembers.filter(matchesSearch);
  return <div className="mt-4 sm:mt-6">
    <div className="flex items-center justify-between gap-2 border-y border-white/[0.07] py-2.5 sm:gap-3 sm:py-3.5">
      <p className="min-w-0 whitespace-nowrap text-xs text-zinc-500 sm:text-sm"><strong className="font-semibold tabular-nums text-white">{activeMembers.length}</strong> activas <span className="mx-1 text-zinc-700 sm:mx-1.5">·</span> <strong className="font-semibold tabular-nums text-zinc-300">{inactiveMembers.length}</strong> inactivas</p>
      <div className="hidden w-64 md:block"><SearchField value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar persona..." /></div>
      <PrimaryButton type="button" onClick={() => openForm()} className="min-h-11 shrink-0 gap-1.5 px-3.5 text-sm sm:min-h-12 sm:px-5"><Plus className="size-4" /><span className="sm:hidden">Agregar</span><span className="hidden sm:inline">Agregar persona</span></PrimaryButton>
    </div>
    <MemberList title="Personas activas" members={visibleActiveMembers} busyId={busyId} onEdit={openForm} onToggle={(member) => void setActive(member, false)} onDelete={(member) => void remove(member)} />
    <MemberList title="Personas inactivas" members={visibleInactiveMembers} busyId={busyId} secondary onEdit={openForm} onToggle={(member) => void setActive(member, true)} onDelete={(member) => void remove(member)} />
    {message ? <p role="status" aria-live="polite" className={`mt-5 rounded-xl border px-4 py-3 text-sm ${isError ? "border-rose-400/15 bg-rose-400/[0.06] text-rose-300" : "border-emerald-400/10 bg-emerald-400/[0.05] text-emerald-300"}`}>{message}</p> : null}
    {showForm ? <PersonDialog editing={editing} name={name} busy={busyId !== null} error={isError ? message : ""} onNameChange={setName} onClose={closeForm} onSubmit={save} /> : null}
  </div>;
}

function PersonDialog({ editing, name, busy, error, onNameChange, onClose, onSubmit }: { editing: TeamMember | null; name: string; busy: boolean; error: string; onNameChange: (name: string) => void; onClose: () => void; onSubmit: (event: React.FormEvent) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); const handleKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; window.addEventListener("keydown", handleKeyDown); return () => window.removeEventListener("keydown", handleKeyDown); }, [onClose]);
  const title = editing ? "Editar persona" : "Agregar persona";
  return <div className="fixed inset-0 z-[70] flex items-end justify-center overflow-y-auto bg-black/75 px-3 pt-10 backdrop-blur-sm sm:items-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="person-dialog-title" className="max-h-[calc(100dvh-1rem)] w-full max-w-md overflow-y-auto rounded-t-3xl border border-white/10 bg-[#0c1218] p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl shadow-black/60 sm:rounded-3xl sm:p-7">
      <div className="flex items-start justify-between gap-4"><div><p className="text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-emerald-400">Equipo</p><h2 id="person-dialog-title" className="mt-1 text-2xl font-semibold tracking-tight text-white">{title}</h2></div><button type="button" onClick={onClose} aria-label="Cerrar" className={`grid size-11 shrink-0 place-items-center rounded-xl text-zinc-400 hover:bg-white/[0.06] hover:text-white ${appFocusStyles}`}><X className="size-5" /></button></div>
      <form onSubmit={onSubmit} className="mt-6"><label htmlFor="person-name" className="text-sm font-semibold text-zinc-300">Nombre</label><input ref={inputRef} id="person-name" required value={name} onChange={(event) => onNameChange(event.target.value)} autoComplete="off" className={`${appFieldStyles} mt-2`} />{error ? <p role="alert" className="mt-3 text-sm text-rose-300">{error}</p> : null}<AppActionBar className="mt-6"><PrimaryButton type="submit" disabled={busy} className="w-full sm:w-auto">{busy ? "Guardando..." : editing ? "Guardar cambios" : "Agregar persona"}</PrimaryButton><button type="button" onClick={onClose} disabled={busy} className="min-h-12 px-4 text-zinc-400 disabled:opacity-40">Cancelar</button></AppActionBar></form>
    </section>
  </div>;
}

function MemberList({ title, members, busyId, secondary = false, onEdit, onToggle, onDelete }: { title: string; members: TeamMember[]; busyId: string | null; secondary?: boolean; onEdit: (member: TeamMember) => void; onToggle: (member: TeamMember) => void; onDelete: (member: TeamMember) => void }) {
  return <section className={`mt-6 sm:mt-8 ${secondary ? "opacity-85" : ""}`}><div className="border-b border-white/[0.07] pb-3"><h2 className={`text-lg font-semibold ${secondary ? "text-zinc-300" : "text-white"}`}>{title}</h2><p className="mt-0.5 text-sm text-zinc-600">{members.length} {members.length === 1 ? "persona" : "personas"}</p></div>{members.length ? <><div className="hidden grid-cols-[2.75rem_minmax(0,1.5fr)_minmax(8rem,1fr)_7rem_9rem] items-center gap-3 border-b border-white/[0.07] px-2 py-2.5 text-[0.625rem] font-bold uppercase tracking-[0.16em] text-zinc-600 md:grid"><span /><span>Persona</span><span>Instrumento</span><span>Estado</span><span className="text-right">Acciones</span></div><AppList className="mt-0 border-t-0">{members.map((member) => <MemberRow key={member.id} member={member} busy={busyId !== null} onEdit={onEdit} onToggle={onToggle} onDelete={onDelete} />)}</AppList></> : <AppEmptyState className="mt-2">No hay personas en esta sección.</AppEmptyState>}</section>;
}

function MemberRow({ member, busy, onEdit, onToggle, onDelete }: { member: TeamMember; busy: boolean; onEdit: (member: TeamMember) => void; onToggle: (member: TeamMember) => void; onDelete: (member: TeamMember) => void }) {
  const initials = member.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase("es");
  const avatar = <span aria-hidden="true" className={`grid size-11 shrink-0 place-items-center rounded-full border text-sm font-semibold ${member.active ? "border-emerald-400/15 bg-emerald-400/[0.07] text-emerald-300" : "border-white/[0.08] bg-white/[0.035] text-zinc-500"}`}>{initials}</span>;
  const status = <AppStatusBadge variant={member.active ? "success" : "neutral"}>{member.active ? "Activa" : "Inactiva"}</AppStatusBadge>;
  const menu = <details className="relative"><summary aria-label={`Más acciones para ${member.name}`} className={`grid size-11 cursor-pointer list-none place-items-center rounded-xl text-zinc-400 hover:bg-white/[0.06] hover:text-white [&::-webkit-details-marker]:hidden ${appFocusStyles}`}><MoreHorizontal className="size-5" /></summary><div className="absolute right-0 z-30 mt-1 w-44 rounded-xl border border-white/10 bg-[#11181f] p-1.5 shadow-2xl shadow-black/60"><button type="button" onClick={() => onEdit(member)} className={`${appRowActionStyles} flex w-full items-center gap-2 text-left md:hidden`}><Pencil className="size-4" />Editar</button><button type="button" onClick={() => onToggle(member)} disabled={busy} className={`${appRowActionStyles} block w-full text-left`}>{member.active ? "Desactivar" : "Reactivar"}</button><button type="button" onClick={() => onDelete(member)} disabled={busy} className={`${appRowActionStyles} block w-full text-left text-rose-300 hover:text-rose-200`}>Eliminar</button></div></details>;
  return <>
    <div className="grid min-h-[4.75rem] min-w-0 grid-cols-[2.75rem_minmax(0,1fr)_auto_2.75rem] items-center gap-2 py-2.5 md:hidden">
      {avatar}
      <div className="min-w-0"><p className={`line-clamp-2 break-words text-sm font-semibold leading-5 ${member.active ? "text-white" : "text-zinc-400"}`}>{member.name}</p><p title={member.instrument || "Sin instrumento"} className="mt-0.5 truncate text-xs text-zinc-500">{member.instrument || "Sin instrumento"}</p></div>
      <div className="justify-self-end">{status}</div>
      <div className="justify-self-end">{menu}</div>
    </div>
    <AppListRow className="group hidden min-w-0 transition-colors hover:bg-white/[0.018] md:!grid md:grid-cols-[2.75rem_minmax(0,1.5fr)_minmax(8rem,1fr)_7rem_9rem] md:items-center md:gap-3 md:px-2 md:py-2.5">
      {avatar}
      <p className={`min-w-0 break-words font-semibold leading-snug ${member.active ? "text-white" : "text-zinc-400"}`}>{member.name}</p>
      <p title={member.instrument || "Sin instrumento"} className="min-w-0 truncate text-sm text-zinc-500">{member.instrument || "Sin instrumento"}</p>
      <div>{status}</div>
      <div className="flex items-center justify-end gap-1"><button type="button" onClick={() => onEdit(member)} className={`${appRowActionStyles} inline-flex items-center gap-2`}><Pencil className="size-4" />Editar</button>{menu}</div>
    </AppListRow>
  </>;
}
