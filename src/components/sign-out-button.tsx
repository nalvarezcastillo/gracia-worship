"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SecondaryButton } from "@/components/ui/action-button";
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
    <SecondaryButton onClick={signOut} disabled={isLoading} className="min-h-20 w-full !justify-start !rounded-2xl px-5 text-left sm:min-h-24 sm:px-6">
      <span aria-hidden="true" className="mr-4 text-2xl">🚪</span>
      <span className="text-lg">{isLoading ? "Signing Out..." : "Sign Out"}</span>
    </SecondaryButton>
  );
}
