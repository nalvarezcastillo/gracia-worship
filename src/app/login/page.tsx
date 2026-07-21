import type { Metadata } from "next";
import { LoginForm } from "@/components/login-form";
import { MainContainer } from "@/components/ui/main-container";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Sign In | Gracia Worship" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const requestedPath = (await searchParams).next;
  const value = Array.isArray(requestedPath) ? requestedPath[0] : requestedPath;
  const nextPath = value === "/admin" || value?.startsWith("/admin/") ? value : "/songs";

  return (
    <main className="min-h-screen py-8 sm:py-12">
      <MainContainer className="max-w-lg">
        <PageHeader title="Sign In" description="Administrator access" />
        <LoginForm nextPath={nextPath} />
      </MainContainer>
    </main>
  );
}
