import type { Metadata } from "next";
import { LoginForm } from "@/components/login-form";
import { MainContainer } from "@/components/ui/main-container";

export const metadata: Metadata = { title: "Iniciar sesión | Gracia Worship" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const requestedPath = (await searchParams).next;
  const value = Array.isArray(requestedPath) ? requestedPath[0] : requestedPath;
  const nextPath = value === "/admin" || value?.startsWith("/admin/") ? value : "/songs";

  return (
    <main className="relative flex min-h-screen items-center overflow-hidden py-8 sm:py-12">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_50%_0%,rgba(40,215,160,0.09),transparent_68%)]" />
      <MainContainer className="relative max-w-md">
        <header className="text-center"><span aria-hidden="true" className="mx-auto grid size-12 place-items-center rounded-2xl bg-emerald-400 text-2xl font-black tracking-[-0.08em] text-[#04110d] shadow-[0_16px_40px_rgba(40,215,160,0.14)]">G</span><p className="mt-5 text-[0.6875rem] font-bold uppercase tracking-[0.24em] text-emerald-400">Gracia Worship</p><h1 className="mt-2 text-3xl font-bold tracking-[-0.04em] text-white">Iniciar sesión</h1><p className="mt-2 text-sm text-zinc-500">Acceso de administrador</p></header>
        <LoginForm nextPath={nextPath} />
      </MainContainer>
    </main>
  );
}
