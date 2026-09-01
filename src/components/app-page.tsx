import type { ReactNode } from "react";
import { MainContainer } from "@/components/ui/main-container";
import { PageHeader } from "@/components/ui/page-header";

type AppPageProps = {
  aside?: ReactNode;
  breadcrumb?: ReactNode;
  children: ReactNode;
  description?: string;
  eyebrow?: string;
  maxWidth?: string;
  title: string;
  desktopAdminSidebar?: boolean;
  hideMobileHeader?: boolean;
};

export function AppPage({ aside, breadcrumb, children, description, eyebrow, maxWidth = "max-w-3xl", title, desktopAdminSidebar = false, hideMobileHeader = false }: AppPageProps) {
  return (
    <main className={`min-h-screen ${hideMobileHeader ? "pt-4 pb-0 lg:py-0" : "pb-8 pt-6 sm:py-10 lg:py-12"}`}>
      <MainContainer className={`${maxWidth} ${desktopAdminSidebar ? "lg:py-2" : ""}`}>
        <div className="min-w-0">
        <div className={hideMobileHeader ? "hidden lg:block" : ""}>{breadcrumb ? <div className="mb-2 text-xs text-zinc-500 sm:text-sm">{breadcrumb}</div> : null}<PageHeader aside={aside} description={description} eyebrow={eyebrow} title={title} /></div>
        {children}
        </div>
      </MainContainer>
    </main>
  );
}
