import type { Metadata } from "next";
import { ReactNode } from "react";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { AppStateProvider } from "@/context/app-state";

export const metadata: Metadata = {
  title: "GDPR Sentinel",
  description: "Automated GDPR data discovery frontend prototype"
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AppStateProvider>
          <AppShell>{children}</AppShell>
        </AppStateProvider>
      </body>
    </html>
  );
}
