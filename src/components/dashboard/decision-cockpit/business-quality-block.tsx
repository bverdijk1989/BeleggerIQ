import Link from "next/link";
import {
  ArrowRight,
  Building2,
  Crown,
  Info,
  ShieldAlert,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { BusinessQualitySummary } from "@/lib/analytics";

import { BusinessQualityCard } from "./business-quality-card";

/**
 * BusinessQualityBlock — Buffett-laag op het dashboard.
 *
 * Vier secties:
 *  1. **Sterkste bedrijven** (top-3 op score)
 *  2. **Zwakste bedrijven** (bottom-3 op score)
 *  3. **Langetermijnhouders** — engine-canonical 10y-flag
 *  4. **Speculatieve waarschuwingen** — materiële weight + risk-label
 *
 * Pure presentatie. Alle data komt uit `summarizeBusinessQuality`.
 * Bij lage confidence of grote uncovered-weight tonen we een banner.
 */

interface Props {
  summary: BusinessQualitySummary;
}

export function BusinessQualityBlock({ summary }: Props) {
  if (summary.evaluatedCount === 0) {
    return (
      <Card>
        <CardContent className="p-5">
          <Header />
          <p className="mt-3 rounded-md border border-dashed border-border/60 bg-surface/40 p-3 text-sm text-muted-foreground">
            Geen single-stock posities (EQUITY/REIT) in deze portefeuille — de
            Business Quality Layer heeft niets te scoren.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5">
        <Header />

        {summary.warnings.length > 0 && (
          <ConfidenceBanner
            confidence={summary.overallConfidence}
            warnings={summary.warnings}
          />
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Section
            title="Sterkste bedrijven"
            icon={Building2}
            iconClass="text-emerald-300"
            emptyText="Nog geen sterke bedrijven boven de drempel — vul fundamentals aan voor scherpere scoring."
            items={summary.strongestBusinesses}
          />
          <Section
            title="Zwakste bedrijven"
            icon={ShieldAlert}
            iconClass="text-destructive"
            emptyText="Geen zwakke bedrijven onder de drempel — Business Quality Layer ziet geen rode vlaggen."
            items={summary.weakestBusinesses}
          />
        </div>

        {summary.longTermHoldCandidates.length > 0 && (
          <div className="space-y-2">
            <SubsectionHeader
              icon={Crown}
              iconClass="text-emerald-200"
              title="Langetermijnhouders (≥ 10 jaar profiel)"
              count={summary.longTermHoldCandidates.length}
            />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {summary.longTermHoldCandidates.slice(0, 3).map((item, i) => (
                <BusinessQualityCard
                  key={item.ticker}
                  item={item}
                  rank={{
                    current: i + 1,
                    total: summary.longTermHoldCandidates.length,
                  }}
                />
              ))}
            </div>
            {summary.longTermHoldCandidates.length > 3 && (
              <p className="text-[10px] text-muted-foreground">
                + {summary.longTermHoldCandidates.length - 3} meer — bekijk alles in /portfolio.
              </p>
            )}
          </div>
        )}

        {summary.speculativeWarnings.length > 0 && (
          <div className="space-y-2">
            <SubsectionHeader
              icon={ShieldAlert}
              iconClass="text-destructive"
              title="Speculatief / cyclisch (materieel gewicht)"
              count={summary.speculativeWarnings.length}
            />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {summary.speculativeWarnings.slice(0, 3).map((item) => (
                <BusinessQualityCard key={item.ticker} item={item} />
              ))}
            </div>
            {summary.speculativeWarnings.length > 3 && (
              <p className="text-[10px] text-muted-foreground">
                + {summary.speculativeWarnings.length - 3} meer — bekijk alles in /portfolio.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
//  Sub-pieces
// ============================================================

function Header() {
  return (
    <header className="flex items-start justify-between gap-2">
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/15 text-primary">
          <Building2 className="h-4 w-4" />
        </span>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Bedrijfskwaliteit (Buffett-laag)
          </p>
          <p className="text-sm text-foreground">
            Welke posities zijn sterke bedrijven, welke cyclisch of speculatief.
          </p>
        </div>
      </div>
      <Link
        href="/portfolio"
        className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-surface/40 px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
        aria-label="Open portefeuille-pagina"
      >
        Bekijk alles <ArrowRight className="h-3 w-3" />
      </Link>
    </header>
  );
}

interface SectionProps {
  title: string;
  icon: typeof Building2;
  iconClass: string;
  emptyText: string;
  items: BusinessQualitySummary["strongestBusinesses"];
}

function Section({
  title,
  icon: Icon,
  iconClass,
  emptyText,
  items,
}: SectionProps) {
  return (
    <div className="space-y-2">
      <SubsectionHeader
        icon={Icon}
        iconClass={iconClass}
        title={title}
        count={items.length}
      />
      {items.length === 0 ? (
        <p className="rounded-md border border-dashed border-border/60 bg-surface/40 p-3 text-xs text-muted-foreground">
          {emptyText}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {items.map((item, i) => (
            <BusinessQualityCard
              key={item.ticker}
              item={item}
              rank={{ current: i + 1, total: items.length }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SubsectionHeader({
  icon: Icon,
  iconClass,
  title,
  count,
}: {
  icon: typeof Building2;
  iconClass: string;
  title: string;
  count: number;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className={`h-3.5 w-3.5 ${iconClass}`} aria-hidden />
        {title}
      </p>
      <span className="rounded-md border border-border/40 bg-surface-elevated px-2 py-0.5 text-[10px] text-muted-foreground">
        {count}
      </span>
    </div>
  );
}

function ConfidenceBanner({
  confidence,
  warnings,
}: {
  confidence: number;
  warnings: string[];
}) {
  const firstWarning = warnings[0];
  return (
    <TooltipProvider delayDuration={120} skipDelayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <p className="flex items-start gap-1 rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-[11px] text-amber-200">
            <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
            <span>
              Business-quality data is beperkt betrouwbaar (gewogen confidence{" "}
              {(confidence * 100).toFixed(0)}%) — labels zijn indicatief.
            </span>
          </p>
        </TooltipTrigger>
        {firstWarning && (
          <TooltipContent side="bottom" className="max-w-xs text-xs">
            <ul className="space-y-1">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
}
