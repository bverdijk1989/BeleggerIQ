import type { ReactNode } from "react";

import { ComplianceBanner } from "@/components/common/compliance-banner";
import { resolveUserFromServer } from "@/lib/auth";
import { portfolioRepository } from "@/lib/data";
import { resolveServerLocale } from "@/lib/i18n";
import { DEFAULT_UX_MODE, type UxMode } from "@/lib/ux-mode";

import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";

interface AppShellProps {
  children: ReactNode;
}

export async function AppShell({ children }: AppShellProps) {
  const locale = await resolveServerLocale();

  // Lees de UX-mode van de gebruiker zodat sidebar + mobile-nav meteen
  // de juiste subset van routes tonen. Faal-safe: bij geen sessie of
  // DB-hick-up vallen we terug op DEFAULT_UX_MODE.
  const uxMode = await resolveUxMode();

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar className="hidden md:flex" uxMode={uxMode} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar locale={locale} uxMode={uxMode} />
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

async function resolveUxMode(): Promise<UxMode> {
  const auth = await resolveUserFromServer().catch(() => ({ ok: false } as const));
  if (!auth.ok) return DEFAULT_UX_MODE;
  const ctx = await portfolioRepository
    .findUserContextByEmail(auth.user.email)
    .catch(() => null);
  return ctx?.profile?.uxMode ?? DEFAULT_UX_MODE;
}
