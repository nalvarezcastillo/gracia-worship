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

  return <SecondaryButton onClick={signOut} disabled={isLoading} className="mt-9 w-full">{isLoading ? "Signing Out..." : "Sign Out"}</SecondaryButton>;
}
