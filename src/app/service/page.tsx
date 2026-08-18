import type { Metadata } from "next";
import { ServiceHub } from "@/components/service-hub";
import { ServicePlanCreator } from "@/components/service-plan-creator";
import { MainContainer } from "@/components/ui/main-container";
import { hasAuthenticatedUser } from "@/lib/auth";
import { getServiceHubData } from "@/lib/services";

export const metadata: Metadata = { title: "Servicios | Gracia Worship" };
export const dynamic = "force-dynamic";

export default async function ServicePage() {
  const [data, authenticated] = await Promise.all([getServiceHubData(), hasAuthenticatedUser()]);
  return (
    <main className="min-h-screen py-7 sm:py-10 lg:py-8">
      <MainContainer className="max-w-5xl">
        <header className="border-b border-white/[0.08] pb-5 sm:flex sm:items-end sm:justify-between sm:gap-6">
          <div>
          <p className="text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-emerald-400">Planificación</p>
          <h1 className="mt-2 text-[2rem] font-bold tracking-[-0.035em] text-white sm:text-4xl">Servicios</h1>
          <p className="mt-2 text-sm text-zinc-400">Consulta los próximos servicios y el historial disponible.</p>
          </div>
          {authenticated ? <div className="mt-5 shrink-0 sm:mt-0"><ServicePlanCreator services={data.services} /></div> : null}
        </header>
        <ServiceHub data={data} authenticated={authenticated} />
      </MainContainer>
    </main>
  );
}
