import type { ReactNode } from "react";

import { ComplianceBanner } from "@/components/common/compliance-banner";
import { AppFooter } from "@/components/common/footer";
import { resolveUserFromServer } from "@/lib/auth";
import { alertRepository, portfolioRepository } from "@/lib/data";
import { resolveServerLocale } from "@/lib/i18n";
import { DEFAULT_UX_MODE, type UxMode } from "@/lib/ux-mode";

import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";

interface AppShellProps {
  children: ReactNode;
}

interface ShellContext {
  uxMode: UxMode;
  unreadAlertsCount: number;
}

export async function AppShell({ children }: AppShellProps) {
  const locale = await resolveServerLocale();

  // Lees user-context (UX-mode + unread-alerts) zodat sidebar + topbar
  // meteen kloppen. Faal-safe: bij geen sessie of DB-hick-up vallen we
  // terug op defaults — beter degraded UI dan crash.
  const ctx = await resolveShellContext();

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar className="hidden md:flex" uxMode={ctx.uxMode} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          locale={locale}
          uxMode={ctx.uxMode}
          unreadAlertsCount={ctx.unreadAlertsCount}
        />
        <main className="flex-1 px-3 py-6 sm:px-4 md:px-8 md:py-8">
          <div className="mx-auto w-full max-w-7xl space-y-6">
            <ComplianceBanner locale={locale} />
            {children}
          </div>
        </main>
        <AppFooter />
      </div>
    </div>
  );
}

async function resolveShellContext(): Promise<ShellContext> {
  const auth = await resolveUserFromServer().catch(() => ({ ok: false } as const));
  if (!auth.ok) {
    return { uxMode: DEFAULT_UX_MODE, unreadAlertsCount: 0 };
  }
  const ctx = await portfolioRepository
    .findUserContextByEmail(auth.user.email)
    .catch(() => null);
  if (!ctx?.userId) {
    return { uxMode: DEFAULT_UX_MODE, unreadAlertsCount: 0 };
  }
  const unreadAlertsCount = await alertRepository
    .unreadCount(ctx.userId)
    .catch(() => 0);
  return {
    uxMode: ctx.profile?.uxMode ?? DEFAULT_UX_MODE,
    unreadAlertsCount,
  };
}
