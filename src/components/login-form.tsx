"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { PrimaryButton } from "@/components/ui/action-button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const fieldStyles = "min-h-12 w-full rounded-2xl border border-white/8 bg-zinc-950/45 px-4 text-base text-white shadow-inner shadow-black/10 outline-none transition-all duration-200 placeholder:text-zinc-600 hover:border-white/12 focus:border-emerald-400/50 focus:bg-zinc-950/60 focus:ring-4 focus:ring-emerald-400/[0.07]";
const LOGIN_TIMEOUT_MS = 15_000;

class LoginTimeoutError extends Error {
  constructor() {
    super("The sign-in request timed out.");
    this.name = "LoginTimeoutError";
  }
}

export function LoginForm({ nextPath }: { nextPath: string }) {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    console.log("Form submitted");

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    if (!email || !password) {
      setMessage("Enter your email and password.");
      return;
    }

    console.log("Validation passed");
    setIsLoading(true);
    setMessage("");

    try {
      console.log("[auth] Supabase configuration", {
        hasUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
        hasAnonKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      });
      const supabase = createSupabaseBrowserClient();
      console.log("Calling Supabase login");

      const { data, error } = await Promise.race([
        supabase.auth.signInWithPassword({ email, password }),
        new Promise<never>((_, reject) => {
          window.setTimeout(() => reject(new LoginTimeoutError()), LOGIN_TIMEOUT_MS);
        }),
      ]);

      console.log("Supabase returned");
      console.log("[auth] Login response", {
        hasSession: Boolean(data.session),
        hasUser: Boolean(data.user),
      });

      if (error) {
        console.error("[auth] Supabase rejected the sign-in request:", error);
        throw error;
      }

      if (!data.session) {
        throw new Error("Supabase did not return a session.");
      }

      console.log("Redirecting");
      window.location.assign(nextPath);
    } catch (error) {
      console.error("[auth] Sign-in failed:", error);
      setMessage(getLoginErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-5 rounded-3xl border border-white/[0.07] bg-zinc-900/60 p-5 shadow-2xl shadow-black/15 sm:mt-10 sm:space-y-6 sm:p-7">
      <label className="block"><span className="mb-2 block text-sm font-semibold text-zinc-300">Email</span><input required name="email" type="email" autoComplete="email" className={fieldStyles} /></label>
      <label className="block"><span className="mb-2 block text-sm font-semibold text-zinc-300">Password</span><input required name="password" type="password" autoComplete="current-password" className={fieldStyles} /></label>
      <PrimaryButton type="submit" disabled={isLoading} onClick={() => console.log("Button clicked")} className="min-h-14 w-full">{isLoading ? "Signing In..." : "Sign In"}</PrimaryButton>
      <p role="status" aria-live="polite" className="min-h-6 text-center text-sm font-medium text-rose-400">{message}</p>
    </form>
  );
}

function getLoginErrorMessage(error: unknown) {
  if (error instanceof LoginTimeoutError) {
    return "Sign in timed out. Check your connection and try again.";
  }

  if (error instanceof Error) {
    if (error.message.includes("Supabase environment variables")) {
      return "Sign in is not configured correctly. Please contact the administrator.";
    }

    if (error.message.toLowerCase().includes("invalid login credentials")) {
      return "Invalid email or password.";
    }
  }

  return "Unable to sign in. Please try again.";
}
