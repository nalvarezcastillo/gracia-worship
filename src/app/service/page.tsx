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
    <main className="min-h-screen pb-[calc(6rem+env(safe-area-inset-bottom))] pt-3.5 sm:py-10 lg:py-9 xl:py-11">
      <MainContainer className="max-w-5xl">
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-3 border-b border-white/[0.07] pb-3 sm:flex sm:items-end sm:justify-between sm:gap-6 sm:border-white/[0.08] sm:pb-5">
          <div className="contents min-w-0 sm:block">
          <p className="col-span-2 row-start-1 text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-emerald-400">Planificación</p>
          <h1 className="col-start-1 row-start-2 mt-0.5 text-[1.75rem] font-bold leading-9 tracking-[-0.035em] text-white sm:mt-2 sm:text-4xl">Servicios</h1>
          <p className="col-span-2 row-start-3 text-[0.8125rem] leading-5 text-zinc-400 sm:mt-2 sm:text-sm">Consulta y administra tus servicios.</p>
          </div>
          {authenticated ? <div className="col-start-2 row-start-2 shrink-0 pb-0.5 sm:mt-0 sm:pb-0"><ServicePlanCreator services={data.services} /></div> : null}
        </header>
        <ServiceHub data={data} authenticated={authenticated} />
      </MainContainer>
    </main>
  );
}
