import { ArrowDownRight, ArrowUpRight, Info, Tornado } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import type {
  MacroScenarioReport,
  MacroScenarioResult,
  PositionImpact,
} from "@/lib/analytics";
import { cn, formatCurrency } from "@/lib/utils";
import type { Currency } from "@/types/common";

/**
 * MacroScenariosCard — pure presentatie van een `MacroScenarioReport`.
 *
 * Geen rekenwerk. Toont per scenario: portfolio-impact (% en bedrag),
 * defensieve-sterkte score, en de top-N losers/winners. Bedoeld voor
 * een "Wat als..." sectie op /risico.
 */

interface Props {
  report: MacroScenarioReport;
}

export function MacroScenariosCard({ report }: Props) {
  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-elevated text-warning">
            <Tornado className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Wat als…
            </p>
            <p className="text-sm text-foreground">
              Vier indicatieve macro-scenario's bovenop je huidige
              portefeuille. Geen voorspelling — een gevoeligheids-check.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {report.scenarios.map((s) => (
            <ScenarioTile
              key={s.scenario}
              scenario={s}
              baseCurrency={report.baseCurrency}
            />
          ))}
        </div>

        <p className="flex items-start gap-2 border-t border-border/60 pt-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Shocks zijn vaste sector- en asset-class-tabellen — geen
            economisch model. Resultaten zijn richtinggevend, niet
            voorspellend. Cash en bonds krijgen lagere multipliers.
          </span>
        </p>
      </CardContent>
    </Card>
  );
}

// ============================================================
//  Scenario tile
// ============================================================

function ScenarioTile({
  scenario,
  baseCurrency,
}: {
  scenario: MacroScenarioResult;
  baseCurrency: Currency;
}) {
  const tone =
    scenario.portfolioImpact <= -0.1
      ? "bad"
      : scenario.portfolioImpact <= -0.02
        ? "warn"
        : scenario.portfolioImpact >= 0.02
          ? "good"
          : "neutral";
  const Icon =
    scenario.portfolioImpact >= 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <div className="rounded-md border border-border/60 bg-surface/60 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">
            {scenario.label}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {scenario.description}
          </p>
        </div>
        <div
          className={cn(
            "flex h-9 w-16 items-center justify-center gap-0.5 rounded-md border font-mono text-sm font-semibold tabular-nums",
            tone === "bad"
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : tone === "warn"
                ? "border-warning/40 bg-warning/10 text-warning"
                : tone === "good"
                  ? "border-success/40 bg-success/10 text-success"
                  : "border-muted-foreground/40 bg-surface-elevated text-muted-foreground",
          )}
        >
          <Icon className="h-3.5 w-3.5" />
          {(scenario.portfolioImpact * 100).toFixed(1)}%
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <Stat
          label="Bedrag"
          value={formatCurrency(scenario.portfolioImpactAmount, baseCurrency, {
            maximumFractionDigits: 0,
          })}
          tone={tone === "bad" || tone === "warn" ? "bad" : "neutral"}
        />
        <Stat
          label="Defensieve sterkte"
          value={`${scenario.defensiveStrength}/100`}
        />
      </dl>

      {scenario.biggestLosers.length > 0 && (
        <ImpactList title="Hardst geraakt" items={scenario.biggestLosers} negative />
      )}
      {scenario.biggestWinners.length > 0 && (
        <ImpactList title="Beste positie" items={scenario.biggestWinners} />
      )}

      <p className="mt-3 border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
        {scenario.verdict}
      </p>

      {scenario.warnings.length > 0 && (
        <ul className="mt-2 space-y-1">
          {scenario.warnings.map((w, i) => (
            <li key={i} className="text-[10px] text-amber-200">
              · {w}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ImpactList({
  title,
  items,
  negative,
}: {
  title: string;
  items: PositionImpact[];
  negative?: boolean;
}) {
  return (
    <div className="mt-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </p>
      <ul className="mt-1 space-y-0.5">
        {items.slice(0, 3).map((p) => (
          <li
            key={p.ticker}
            className="flex items-center justify-between gap-2 text-[11px]"
          >
            <span className="truncate text-foreground">
              {p.ticker}
              <span className="ml-1 text-muted-foreground">
                ({(p.weight * 100).toFixed(1)}%)
              </span>
            </span>
            <span
              className={cn(
                "shrink-0 font-mono tabular-nums",
                negative ? "text-destructive" : "text-success",
              )}
            >
              {(p.contribution * 100).toFixed(2)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "bad";
}) {
  return (
    <div className="rounded-sm bg-surface-elevated/40 px-2 py-1">
      <dt className="text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-0.5 font-mono tabular-nums",
          tone === "bad" ? "text-destructive" : "text-foreground",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
