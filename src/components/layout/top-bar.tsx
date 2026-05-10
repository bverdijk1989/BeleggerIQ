import { Search } from "lucide-react";

import { NotificationBell } from "@/components/alerts/notification-bell";
import type { Locale } from "@/lib/i18n";
import type { UxMode } from "@/lib/ux-mode";

import { LocaleSwitcher } from "./locale-switcher";
import { MobileNav } from "./mobile-nav";
import { PortfolioSwitcher } from "./portfolio-switcher";

interface TopBarProps {
  locale?: Locale;
  uxMode?: UxMode | null;
  /** Aantal ongelezen notificaties (server-side opgehaald in AppShell). */
  unreadAlertsCount?: number;
}

export function TopBar({
  locale = "nl",
  uxMode,
  unreadAlertsCount = 0,
}: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border/60 bg-background/80 px-4 backdrop-blur md:px-8">
      <MobileNav uxMode={uxMode} />

      <div className="hidden flex-1 items-center gap-2 rounded-md border border-border/60 bg-surface px-3 py-1.5 text-sm text-muted-foreground md:flex md:max-w-md">
        <Search className="h-4 w-4" />
        <span>
          {locale === "en"
            ? "Search ticker, sector or report"
            : "Zoek een ticker, sector of rapport"}
        </span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {/* Server-component: laadt eigen portefeuilles van de actieve user.
            Toont niets bij single-portfolio of niet-ingelogd. */}
        <PortfolioSwitcher />
        <LocaleSwitcher current={locale} />
        <NotificationBell unreadCount={unreadAlertsCount} />
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-elevated text-xs font-semibold text-foreground">
          BV
        </div>
      </div>
    </header>
  );
}
