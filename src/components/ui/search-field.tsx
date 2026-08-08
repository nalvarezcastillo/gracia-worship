import type { ChangeEventHandler } from "react";
import { SearchIcon } from "@/components/icons";
import { appFieldStyles } from "@/components/ui/styles";

export function SearchField({ value, onChange, placeholder = "Search" }: { value: string; onChange: ChangeEventHandler<HTMLInputElement>; placeholder?: string }) {
  return (
    <label className="relative block w-full">
      <span className="sr-only">{placeholder}</span>
      <SearchIcon className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-zinc-500 transition-colors duration-200" />
      <input
        type="search"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={`${appFieldStyles} pl-12`}
      />
    </label>
  );
}
