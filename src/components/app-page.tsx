import type { ReactNode } from "react";
import packageJson from "../../package.json";
import { MainContainer } from "@/components/ui/main-container";
import { PageHeader } from "@/components/ui/page-header";
import { DesktopAdminSidebar } from "@/components/desktop-admin-sidebar";

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
    <main className={`min-h-screen ${hideMobileHeader ? "pt-4 pb-0 lg:py-0" : `py-8 sm:py-12 ${desktopAdminSidebar ? "lg:py-0" : ""}`}`}>
      <MainContainer className={desktopAdminSidebar ? "lg:max-w-none lg:px-0" : maxWidth}>
        <div className={desktopAdminSidebar ? "lg:grid lg:min-h-[calc(100vh-4rem)] lg:grid-cols-[220px_minmax(0,1fr)]" : ""}>
        {desktopAdminSidebar ? <DesktopAdminSidebar version={packageJson.version} /> : null}
        <div className={desktopAdminSidebar ? `min-w-0 lg:px-7 lg:py-7 xl:px-9 ${maxWidth} lg:mx-auto lg:w-full` : ""}>
        <div className={hideMobileHeader ? "hidden lg:block" : ""}>{breadcrumb ? <div className="mb-2 text-sm text-zinc-500">{breadcrumb}</div> : null}<PageHeader aside={aside} description={description} eyebrow={eyebrow} title={title} /></div>
        {children}
        </div>
        </div>
      </MainContainer>
    </main>
  );
}
