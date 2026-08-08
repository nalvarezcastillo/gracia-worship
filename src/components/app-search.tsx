import type { ChangeEventHandler } from "react";
import { SearchIcon } from "@/components/icons";
import { appFieldStyles } from "@/components/ui/styles";

export function AppSearch({ className = "", label = "Buscar", onChange, placeholder = "Buscar", value }: { className?: string; label?: string; onChange: ChangeEventHandler<HTMLInputElement>; placeholder?: string; value: string }) {
  return <label className={`block ${className}`}><span className="mb-2 block text-sm font-semibold text-zinc-300">{label}</span><span className="relative block"><SearchIcon className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-zinc-500" /><input type="search" value={value} onChange={onChange} placeholder={placeholder} className={`${appFieldStyles} pl-12`} /></span></label>;
}
