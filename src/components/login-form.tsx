"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PrimaryButton } from "@/components/ui/action-button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const fieldStyles = "min-h-12 w-full rounded-2xl border border-white/8 bg-zinc-950/45 px-4 text-base text-white shadow-inner shadow-black/10 outline-none transition-all duration-200 placeholder:text-zinc-600 hover:border-white/12 focus:border-emerald-400/50 focus:bg-zinc-950/60 focus:ring-4 focus:ring-emerald-400/[0.07]";

export function LoginForm({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    setIsLoading(true);
    setMessage("");

    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      router.replace(nextPath);
      router.refresh();
    } catch {
      setIsLoading(false);
      setMessage("Unable to sign in. Check your email and password.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-5 rounded-3xl border border-white/[0.07] bg-zinc-900/60 p-5 shadow-2xl shadow-black/15 sm:mt-10 sm:space-y-6 sm:p-7">
      <label className="block"><span className="mb-2 block text-sm font-semibold text-zinc-300">Email</span><input required name="email" type="email" autoComplete="email" className={fieldStyles} /></label>
      <label className="block"><span className="mb-2 block text-sm font-semibold text-zinc-300">Password</span><input required name="password" type="password" autoComplete="current-password" className={fieldStyles} /></label>
      <PrimaryButton type="submit" disabled={isLoading} className="min-h-14 w-full">{isLoading ? "Signing In..." : "Sign In"}</PrimaryButton>
      <p role="status" aria-live="polite" className="min-h-6 text-center text-sm font-medium text-rose-400">{message}</p>
    </form>
  );
}
