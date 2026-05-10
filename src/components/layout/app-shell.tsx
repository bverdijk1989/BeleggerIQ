import type { ReactNode } from "react";

import { ComplianceBanner } from "@/components/common/compliance-banner";
import { resolveServerLocale } from "@/lib/i18n";

import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";

interface AppShellProps {
  children: ReactNode;
}

export async function AppShell({ children }: AppShellProps) {
  const locale = await resolveServerLocale();
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar className="hidden md:flex" />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar locale={locale} />
        <main className="flex-1 px-4 py-6 md:px-8 md:py-8">
          <div className="mx-auto w-full max-w-7xl space-y-6">
            <ComplianceBanner locale={locale} />
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
