import type { ChangeEventHandler } from "react";
import { SearchIcon } from "@/components/icons";

export function SearchField({ value, onChange, placeholder = "Search" }: { value: string; onChange: ChangeEventHandler<HTMLInputElement>; placeholder?: string }) {
  return (
    <label className="relative block w-full">
      <span className="sr-only">{placeholder}</span>
      <SearchIcon className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-zinc-500" />
      <input
        type="search"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="h-12 w-full rounded-2xl border border-white/8 bg-white/6 pl-12 pr-4 text-base text-white outline-none transition duration-200 placeholder:text-zinc-500 focus:border-emerald-400/60 focus:bg-white/9 focus:ring-4 focus:ring-emerald-400/5"
      />
    </label>
  );
}
