import { Bell, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n";
import type { UxMode } from "@/lib/ux-mode";

import { LocaleSwitcher } from "./locale-switcher";
import { MobileNav } from "./mobile-nav";
import { PortfolioSwitcher } from "./portfolio-switcher";

interface TopBarProps {
  locale?: Locale;
  uxMode?: UxMode | null;
}

export function TopBar({ locale = "nl", uxMode }: TopBarProps) {
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
        <Button
          variant="ghost"
          size="icon"
          aria-label="Notificaties"
          className="relative"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary" />
        </Button>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-elevated text-xs font-semibold text-foreground">
          BV
        </div>
      </div>
    </header>
  );
}
