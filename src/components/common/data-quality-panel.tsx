import { ShieldCheck, ShieldAlert, ShieldQuestion } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import {
  MISSING_FIELD_LABELS,
  SEVERITY_LABELS,
  portfolioQualityVerdict,
  type HoldingQuality,
  type PortfolioQualityReport,
} from "@/lib/analytics/data-quality";
import { cn, formatPercent } from "@/lib/utils";

/**
 * DataQualityPanel — presentationele component.
 *
 * Neemt een kant-en-klaar `PortfolioQualityReport` (uit
 * `assessPortfolioQuality`) en rendert: top-level verdict, distributie-
 * statistieken en een per-holding tabel met ontbrekende velden.
 *
 * Geen businesslogica, geen fetches. Alle labels/drempels/severities
 * komen uit de pure `data-quality.ts` module; dit bestand doet slechts
 * opmaak en taal.
 */

interface DataQualityPanelProps {
  report: PortfolioQualityReport;
  /** Compacte modus voor gebruik op /dashboard. Default false (volledige tabel). */
  compact?: boolean;
  className?: string;
}

export function DataQualityPanel({
  report,
  compact = false,
  className,
}: DataQualityPanelProps) {
  const verdict = portfolioQualityVerdict(report.overallScore);

  return (
    <Card className={cn("bg-surface/60", className)}>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Data-kwaliteit
            </p>
            <p className="text-sm text-muted-foreground">
              Hoe compleet zijn sector, regio en asset-class voor je holdings.
            </p>
          </div>
          <VerdictBadge verdict={verdict} score={report.overallScore} />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric
            label="Volledig"
            value={report.fullyEnriched}
            total={report.holdingCount}
            tone="positive"
          />
          <Metric
            label="Deels"
            value={report.partiallyEnriched}
            total={report.holdingCount}
            tone="neutral"
          />
          <Metric
            label="Onvolledig"
            value={report.poorlyEnriched}
            total={report.holdingCount}
            tone="warning"
          />
          <Metric
            label="Onbekende sector"
            value={Math.round(report.unknownSectorWeight * 100)}
            suffix="%"
            tone={report.unknownSectorWeight > 0.1 ? "warning" : "neutral"}
          />
        </div>

        {!compact && report.holdings.length > 0 && (
          <HoldingsTable holdings={report.holdings} />
        )}

        {compact && report.unknownSectorWeight > 0 && (
          <p className="text-xs text-muted-foreground">
            {formatPercent(report.unknownSectorWeight)} van je portefeuille
            (weight) heeft geen sector-data — dit beperkt factor-attribution
            en sector-exposure-analyse.
          </p>
        )}

        <Provenance distribution={report.distributionBySource} />
      </CardContent>
    </Card>
  );
}

// ============================================================
//  Subcomponenten
// ============================================================

function VerdictBadge({
  verdict,
  score,
}: {
  verdict: ReturnType<typeof portfolioQualityVerdict>;
  score: number;
}) {
  const Icon =
    verdict.tone === "positive"
      ? ShieldCheck
      : verdict.tone === "warning"
        ? ShieldAlert
        : ShieldQuestion;

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium",
        verdict.tone === "positive" &&
          "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
        verdict.tone === "neutral" &&
          "border-amber-500/40 bg-amber-500/10 text-amber-200",
        verdict.tone === "warning" &&
          "border-red-500/40 bg-red-500/10 text-red-200",
      )}
    >
      <Icon className="h-4 w-4" />
      <span>{verdict.label}</span>
      <span className="font-mono text-xs text-muted-foreground">
        {formatPercent(score)}
      </span>
    </div>
  );
}

function Metric({
  label,
  value,
  total,
  suffix,
  tone,
}: {
  label: string;
  value: number;
  total?: number;
  suffix?: string;
  tone: "positive" | "neutral" | "warning";
}) {
  const display = suffix ? `${value}${suffix}` : `${value}${total ? ` / ${total}` : ""}`;
  return (
    <div className="rounded-md border border-border/60 bg-surface/40 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 font-mono text-lg",
          tone === "positive" && "text-emerald-200",
          tone === "neutral" && "text-foreground",
          tone === "warning" && "text-amber-200",
        )}
      >
        {display}
      </p>
    </div>
  );
}

function HoldingsTable({ holdings }: { holdings: HoldingQuality[] }) {
  // Sorteer: major eerst, daarna minor, daarna ok. Binnen groep: hoogste weight eerst.
  const sorted = [...holdings].sort((a, b) => {
    const severityOrder = { major: 0, minor: 1, ok: 2 } as const;
    const sev = severityOrder[a.severity] - severityOrder[b.severity];
    if (sev !== 0) return sev;
    return b.weight - a.weight;
  });
  return (
    <div className="overflow-x-auto rounded-md border border-border/60">
      <table className="w-full min-w-[560px] text-sm">
        <thead className="bg-surface/40 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left">Positie</th>
            <th className="px-3 py-2 text-left">Status</th>
            <th className="px-3 py-2 text-right">Confidence</th>
            <th className="px-3 py-2 text-right">Gewicht</th>
            <th className="px-3 py-2 text-left">Ontbreekt</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((h) => (
            <tr
              key={h.holdingId}
              className="border-t border-border/40 hover:bg-surface/40"
            >
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">{h.ticker}</span>
                  {h.assetClass && (
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {h.assetClass}
                    </span>
                  )}
                </div>
                {h.normalizedTicker && (
                  <p className="text-[11px] text-muted-foreground">
                    ↳ Yahoo:{" "}
                    <span className="font-mono text-foreground">
                      {h.normalizedTicker}
                    </span>
                  </p>
                )}
              </td>
              <td className="px-3 py-2">
                <SeverityPill severity={h.severity} />
              </td>
              <td className="px-3 py-2 text-right font-mono">
                {formatPercent(h.confidence)}
              </td>
              <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                {formatPercent(h.weight)}
              </td>
              <td className="px-3 py-2 text-xs text-muted-foreground">
                {h.missing.length === 0
                  ? "—"
                  : h.missing
                      .map((f) => MISSING_FIELD_LABELS[f])
                      .join(", ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SeverityPill({ severity }: { severity: HoldingQuality["severity"] }) {
  const label = SEVERITY_LABELS[severity];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium",
        severity === "ok" &&
          "border border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
        severity === "minor" &&
          "border border-amber-500/40 bg-amber-500/10 text-amber-200",
        severity === "major" &&
          "border border-red-500/40 bg-red-500/10 text-red-200",
      )}
    >
      {label}
    </span>
  );
}

function Provenance({ distribution }: { distribution: Record<string, number> }) {
  const entries = Object.entries(distribution).filter(([, count]) => count > 0);
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 border-t border-border/40 pt-3 text-[11px] text-muted-foreground">
      <span className="uppercase tracking-[0.18em]">Bronnen:</span>
      {entries.map(([source, count]) => (
        <span
          key={source}
          className="rounded-md border border-border/60 bg-surface/40 px-2 py-0.5"
        >
          {source} <span className="font-mono">{count}</span>
        </span>
      ))}
    </div>
  );
}
