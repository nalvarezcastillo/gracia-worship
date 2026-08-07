"use client";

import { useState } from "react";
import { TeamMemberSelect } from "@/components/team-member-select";
import { formatAssignmentText, parseAssignmentText } from "@/lib/assignment-text";
import type { TeamMember } from "@/lib/team";

const functions = ["Voz", "Piano", "Guitarra Eléctrica", "Guitarra Acústica", "Bajo", "Batería", "Director", "Producción", "Teclados", "Tracks", "Playback", "Multimedia", "Audio", "Luces", "Cámara", "Streaming"];
const fieldStyles = "min-h-12 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-white outline-none focus:border-emerald-400/50 focus:ring-4 focus:ring-emerald-400/[0.07]";

export function AssignmentFields({ members, onChange, value }: { members: TeamMember[]; onChange: (value: string) => void; value: string }) {
  const assignment = parseAssignmentText(value);
  const knownPerson = members.some((member) => member.name === assignment.name);
  const knownFunction = functions.includes(assignment.role);
  const [customFunction, setCustomFunction] = useState(Boolean(assignment.role && !knownFunction));
  const update = (name: string, role: string) => onChange(formatAssignmentText(name, role));
  return <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold text-zinc-300">Persona<span className="mt-2 block"><TeamMemberSelect members={members} value={assignment.name} onChange={(name) => update(name, assignment.role)} /></span>{!knownPerson ? <input value={assignment.name} onChange={(event) => update(event.target.value, assignment.role)} placeholder="Otro nombre" className={`mt-2 ${fieldStyles}`} /> : null}</label><label className="text-sm font-semibold text-zinc-300">Función<select value={customFunction ? "__other" : assignment.role} onChange={(event) => { const custom = event.target.value === "__other"; setCustomFunction(custom); update(assignment.name, custom ? "" : event.target.value); }} className={`mt-2 ${fieldStyles}`}><option value="">Sin función</option>{functions.map((item) => <option key={item} value={item}>{item}</option>)}<option value="__other">Otro...</option></select>{customFunction ? <input value={assignment.role} onChange={(event) => update(assignment.name, event.target.value)} placeholder="Otra función" className={`mt-2 ${fieldStyles}`} /> : null}</label></div>;
}
