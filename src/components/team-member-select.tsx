import type { TeamMember } from "@/lib/team";

export function TeamMemberSelect({ members, onChange, value }: { members: TeamMember[]; onChange: (value: string, custom: boolean) => void; value: string }) {
  const matchesMember = members.some((member) => member.name === value);
  return <select value={matchesMember ? value : value ? "__other" : ""} onChange={(event) => onChange(event.target.value === "__other" ? "" : event.target.value, event.target.value === "__other")} className="min-h-12 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-white outline-none focus:border-emerald-400/50 focus:ring-4 focus:ring-emerald-400/[0.07]"><option value="">Seleccionar persona</option>{members.map((member) => <option key={member.id} value={member.name}>{member.name}</option>)}<option value="__other">Otro nombre...</option></select>;
}
