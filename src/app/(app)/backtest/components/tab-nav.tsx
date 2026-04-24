import Link from "next/link";
import type { Route } from "next";

import { cn } from "@/lib/utils";

/**
 * Server-component tab-navigatie. Behoudt alle bestaande searchParams en
 * voegt alleen `tab=` toe / vervangt het. Geen client-state nodig — de
 * page-component leest `tab` uit `searchParams` en rendert de juiste
 * sectie.
 */

export type BacktestTab = "headline" | "bewijs";

interface Props {
  current: BacktestTab;
  searchParamsString: string; // ?strategy=...&years=...
}

const TABS: Array<{ id: BacktestTab; label: string; description: string }> = [
  {
    id: "headline",
    label: "Headline",
    description: "Performance curve, metrics en disclaimers",
  },
  {
    id: "bewijs",
    label: "Bewijs",
    description: "Regime, worst/best 12m, regret, recovery, DCA",
  },
];

export function TabNav({ current, searchParamsString }: Props) {
  return (
    <nav
      className="flex flex-wrap items-end gap-2 border-b border-border/60 pb-1"
      aria-label="Backtest tabs"
    >
      {TABS.map((tab) => {
        const href = withTabParam(searchParamsString, tab.id);
        const active = current === tab.id;
        return (
          <Link
            key={tab.id}
            href={href}
            scroll={false}
            className={cn(
              "rounded-t-md border-b-2 px-3 py-2 text-sm transition-colors",
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="font-medium">{tab.label}</span>
            <span className="ml-2 hidden text-[11px] text-muted-foreground sm:inline">
              {tab.description}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Helper om in zoekstring `tab` toe te voegen of te vervangen. Houdt de
 * rest (strategy, years, …) intact zodat tab-switches geen run resetten.
 */
function withTabParam(
  searchParamsString: string,
  tab: BacktestTab,
): Route {
  const params = new URLSearchParams(searchParamsString);
  if (tab === "headline") {
    params.delete("tab");
  } else {
    params.set("tab", tab);
  }
  const qs = params.toString();
  // Cast naar Route omdat typedRoutes pure-dynamic query-strings niet
  // generiek kan typen; het pad-deel is wel een bekende route.
  return (qs ? `/backtest?${qs}` : "/backtest") as Route;
}
