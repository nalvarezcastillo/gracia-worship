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
};

export function AppPage({ aside, breadcrumb, children, description, eyebrow, maxWidth = "max-w-3xl", title }: AppPageProps) {
  return (
    <main className="min-h-screen py-8 sm:py-12">
      <MainContainer className={maxWidth}>
        {breadcrumb ? <div className="mb-2 text-sm text-zinc-500">{breadcrumb}</div> : null}
        <PageHeader aside={aside} description={description} eyebrow={eyebrow} title={title} />
        {children}
      </MainContainer>
    </main>
  );
}
