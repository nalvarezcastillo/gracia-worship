import type { Metadata } from "next";
import { BottomNavigation } from "@/components/bottom-navigation";
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
        {children}
        <BottomNavigation />
      </body>
    </html>
  );
}
