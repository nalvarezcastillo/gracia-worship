"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  async function signOut() {
    setIsLoading(true);
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut({ scope: "local" });
    router.replace("/songs");
    router.refresh();
  }

  return (
    <button type="button" onClick={signOut} disabled={isLoading} className="flex min-h-12 w-full items-center px-4 py-3 text-left text-sm font-medium text-zinc-400 transition-colors duration-200 hover:bg-white/[0.035] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 active:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50">
      {isLoading ? "Cerrando sesión..." : "Cerrar sesión"}
    </button>
  );
}
