import type { Metadata } from "next";
import { ApplicationShell } from "@/components/application-shell";
import { LegacyRecentSongCleanup } from "@/components/legacy-recent-song-cleanup";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gracia Worship | Song Library",
  description: "Prepare your team before rehearsal.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <LegacyRecentSongCleanup />
        <ApplicationShell>{children}</ApplicationShell>
      </body>
    </html>
  );
}
