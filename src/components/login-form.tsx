"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { PrimaryButton } from "@/components/ui/action-button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const fieldStyles = "min-h-12 w-full rounded-2xl border border-white/8 bg-zinc-950/45 px-4 text-base text-white shadow-inner shadow-black/10 outline-none transition-all duration-200 placeholder:text-zinc-600 hover:border-white/12 focus:border-emerald-400/50 focus:bg-zinc-950/60 focus:ring-4 focus:ring-emerald-400/[0.07]";
const LOGIN_TIMEOUT_MS = 15_000;

class LoginTimeoutError extends Error {
  constructor() {
    super("La solicitud de inicio de sesión agotó el tiempo de espera.");
    this.name = "LoginTimeoutError";
  }
}

export function LoginForm({ nextPath }: { nextPath: string }) {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    if (!email || !password) {
      setMessage("Escribe tu correo electrónico y contraseña.");
      return;
    }

    setIsLoading(true);
    setMessage("");

    try {
      const supabase = createSupabaseBrowserClient();

      const { data, error } = await Promise.race([
        supabase.auth.signInWithPassword({ email, password }),
        new Promise<never>((_, reject) => {
          window.setTimeout(() => reject(new LoginTimeoutError()), LOGIN_TIMEOUT_MS);
        }),
      ]);

      if (error) {
        console.error("[auth] Supabase rejected the sign-in request:", error);
        throw error;
      }

      if (!data.session) {
        throw new Error("Supabase no devolvió una sesión.");
      }

      window.location.assign(nextPath);
    } catch (error) {
      console.error("[auth] Sign-in failed:", error);
      setMessage(getLoginErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-7 space-y-5 rounded-3xl border border-white/[0.08] bg-[#0c1218]/90 p-5 shadow-2xl shadow-black/30 sm:mt-8 sm:p-7">
      <label className="block"><span className="mb-2 block text-sm font-semibold text-zinc-300">Correo electrónico</span><input required name="email" type="email" autoComplete="email" className={fieldStyles} /></label>
      <label className="block"><span className="mb-2 block text-sm font-semibold text-zinc-300">Contraseña</span><input required name="password" type="password" autoComplete="current-password" className={fieldStyles} /></label>
      <PrimaryButton type="submit" disabled={isLoading} className="min-h-13 w-full">{isLoading ? "Iniciando sesión..." : "Iniciar sesión"}</PrimaryButton>
      <p role="status" aria-live="polite" className="min-h-6 text-center text-sm font-medium text-rose-400">{message}</p>
    </form>
  );
}

function getLoginErrorMessage(error: unknown) {
  if (error instanceof LoginTimeoutError) {
    return "El inicio de sesión tardó demasiado. Revisa tu conexión e intenta nuevamente.";
  }

  if (error instanceof Error) {
    if (error.message.includes("Supabase environment variables")) {
      return "El acceso no está configurado correctamente. Contacta al administrador.";
    }

    if (error.message.toLowerCase().includes("invalid login credentials")) {
      return "El correo electrónico o la contraseña no son válidos.";
    }
  }

  return "No fue posible iniciar sesión. Intenta nuevamente.";
}
