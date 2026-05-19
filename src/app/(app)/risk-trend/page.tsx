import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  HelpCircle,
  Lightbulb,
  Minus,
  ShieldAlert,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Section } from "@/components/common/section";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { resolveUserFromServer } from "@/lib/auth";
import { portfolioRepository } from "@/lib/data";
import {
  loadRiskTrendReport,
  type RiskTrendPoint,
  type TrendDelta,
  type TrendDirection,
} from "@/lib/analytics/risk-trend";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Risk Trend",
};

export const dynamic = "force-dynamic";

/**
 * /risk-trend — Risk Trend & Snapshot History (Module 30).
 *
 * Geen entitlement-gate. Snapshots worden automatisch geschreven door
 * de bestaande snapshot-service (Module 14). Bij <2 snapshots tonen
 * we een EmptyState met instructies.
 */
export default async function RiskTrendPage() {
  const auth = await resolveUserFromServer();
  if (!auth.ok) {
    return (
      <>
        <PageHeader
          eyebrow="Analyse"
          title="Risk Trend"
          description="Authenticatie vereist."
        />
        <EmptyState
          icon={ShieldAlert}
          title="Niet ingelogd"
          description={auth.error}
        />
      </>
    );
  }

  const portfolio = await portfolioRepository
    .findPrimaryByEmail(auth.user.email)
    .catch(() => null);

  if (!portfolio) {
    return (
      <>
        <PageHeader
          eyebrow="Analyse"
          title="Risk Trend"
          description="Voeg eerst een portefeuille toe."
        />
        <EmptyState
          icon={ShieldCheck}
          title="Geen portefeuille"
          description="Snapshots worden gemaakt zodra je portefeuille posities heeft."
        />
      </>
    );
  }

  const report = await loadRiskTrendReport({ portfolioId: portfolio.id });

  if (report.points.length === 0) {
    return (
      <>
        <PageHeader
          eyebrow="Analyse"
          title="Risk Trend"
          description="Nog geen historische snapshots."
        />
        <EmptyState
          icon={TrendingUp}
          title="Snapshots worden binnenkort gemaakt"
          description="De snapshot-service draait periodiek; over een paar dagen verschijnt de eerste meting hier."
        />
      </>
    );
  }

  const summary = report.summary;
  const latest = report.points[report.points.length - 1]!;

  return (
    <>
      <PageHeader
        eyebrow="Analyse"
        title="Risk Trend"
        description={
          summary ? summary.headline : "Eerste snapshot — wacht op tweede meting voor trends."
        }
        actions={
          <Badge variant="outline" className="text-[10px]">
            {report.points.length} snapshots
          </Badge>
        }
      />

      {report.warning ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-200">
          {report.warning}
        </div>
      ) : null}

      {summary ? (
        <Section
          title={`Wat veranderde ${summary.periodLabel}?`}
          description="Top-3 grootste verschuivingen tussen de meest recente twee snapshots."
        >
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            {summary.highlights.length === 0 ? (
              <Card className="md:col-span-3 border-border/60">
                <CardContent className="p-4 text-xs text-muted-foreground">
                  Geen significante veranderingen — discipline gehouden.
                </CardContent>
              </Card>
            ) : (
              summary.highlights.map((d) => (
                <HighlightCard key={d.key} delta={d} />
              ))
            )}
          </div>
        </Section>
      ) : null}

      <Section
        title="Huidige snapshot"
        description={`Gemeten op ${new Date(latest.capturedAt).toLocaleDateString("nl-NL", { day: "2-digit", month: "long", year: "numeric" })}`}
      >
        <SnapshotMetricsGrid point={latest} />
      </Section>

      {summary ? (
        <Section
          title="Alle deltas"
          description="Per metric: huidig, vorige, verandering."
        >
          <DeltaTable deltas={summary.deltas} />
        </Section>
      ) : null}

      <Section
        title="Timeline"
        description={`${report.points.length} snapshots, oudste eerst.`}
      >
        <Timeline points={report.points} />
      </Section>

      {summary && summary.caveats.length > 0 ? (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-100">
          <p className="mb-1 font-semibold">Caveats:</p>
          <ul className="list-disc space-y-1 pl-5">
            {summary.caveats.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-[11px] text-amber-100">
        <p className="flex items-start gap-2">
          <Lightbulb className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          <span>{report.disclaimer}</span>
        </p>
      </div>
    </>
  );
}

// ============================================================
//  Subcomponents
// ============================================================

function HighlightCard({ delta }: { delta: TrendDelta }) {
  const Icon = directionIcon(delta.direction);
  return (
    <Card className={cn("border", directionBorder(delta.direction))}>
      <CardContent className="space-y-1.5 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-foreground">{delta.label}</p>
          <Icon className={cn("h-4 w-4", directionText(delta.direction))} aria-hidden />
        </div>
        <p className="font-mono text-[11px] text-muted-foreground">
          {formatValue(delta.previous, delta.unit)} →{" "}
          <span className={directionText(delta.direction)}>
            {formatValue(delta.current, delta.unit)}
          </span>
        </p>
        <p className="text-xs text-muted-foreground">{delta.message}</p>
      </CardContent>
    </Card>
  );
}

function SnapshotMetricsGrid({ point }: { point: RiskTrendPoint }) {
  const s = point.snapshot;
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
      <MetricCell label="Health Score" value={s.healthScore} unit="score" />
      <MetricCell label="Risico-score" value={s.riskScore} unit="score" />
      <MetricCell label="Datadekking" value={s.dataDepthScore} unit="score" />
      <MetricCell label="Concentratie (HHI)" value={s.concentrationHhi} unit="fraction" />
      <MetricCell label="Grootste positie" value={s.largestPositionWeight} unit="fraction" />
      <MetricCell label="Top-5 weging" value={s.top5Weight} unit="fraction" />
      <MetricCell label="Volatiliteit" value={s.volatility} unit="fraction" />
      <MetricCell label="Max drawdown" value={s.maxDrawdown} unit="fraction" />
      <MetricCell label="Vreemde valuta" value={s.foreignCurrencyExposure} unit="fraction" />
      <MetricCell label="Sector HHI" value={s.sectorHhi} unit="fraction" />
      <MetricCell label="Drift" value={s.driftAvg} unit="fraction" />
      <MetricCell label="Posities" value={s.positionCount} unit="count" />
    </div>
  );
}

function MetricCell({
  label,
  value,
  unit,
}: {
  label: string;
  value: number | null;
  unit: TrendDelta["unit"];
}) {
  return (
    <Card className="border-border/60 bg-surface/40">
      <CardContent className="space-y-0.5 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </p>
        <p className="font-mono text-sm text-foreground">
          {value === null ? "—" : formatValue(value, unit)}
        </p>
      </CardContent>
    </Card>
  );
}

function DeltaTable({ deltas }: { deltas: ReadonlyArray<TrendDelta> }) {
  return (
    <div className="overflow-hidden rounded-md border border-border/40 bg-surface/40">
      <table className="w-full text-[11px]">
        <thead className="bg-muted/20 text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-2 py-1.5 text-left">Metric</th>
            <th className="px-2 py-1.5 text-right">Vorige</th>
            <th className="px-2 py-1.5 text-right">Huidig</th>
            <th className="px-2 py-1.5 text-right">Verandering</th>
            <th className="px-2 py-1.5 text-right">Richting</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {deltas.map((d) => (
            <tr key={d.key} className="border-t border-border/30">
              <td className="px-2 py-1.5 text-foreground">{d.label}</td>
              <td className="px-2 py-1.5 text-right text-muted-foreground">
                {formatValue(d.previous, d.unit)}
              </td>
              <td className="px-2 py-1.5 text-right">{formatValue(d.current, d.unit)}</td>
              <td
                className={cn(
                  "px-2 py-1.5 text-right",
                  directionText(d.direction),
                )}
              >
                {d.change !== null ? formatChange(d.change, d.unit) : "—"}
              </td>
              <td className="px-2 py-1.5 text-right">
                <DirectionBadge direction={d.direction} significant={d.significant} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Timeline({ points }: { points: ReadonlyArray<RiskTrendPoint> }) {
  return (
    <div className="space-y-1.5">
      {points.map((p) => (
        <div
          key={p.capturedAt}
          className="flex items-center justify-between rounded-md border border-border/40 bg-surface/30 px-3 py-2 text-xs"
        >
          <div className="flex items-center gap-2 text-muted-foreground">
            <ArrowRight className="h-3 w-3" aria-hidden />
            <span className="font-mono">
              {new Date(p.capturedAt).toLocaleDateString("nl-NL", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </span>
          </div>
          <div className="flex items-center gap-3 font-mono text-[10px] text-muted-foreground">
            {p.snapshot.healthScore !== null ? (
              <span>Health {Math.round(p.snapshot.healthScore)}</span>
            ) : null}
            {p.snapshot.riskScore !== null ? (
              <span>Risk {Math.round(p.snapshot.riskScore)}</span>
            ) : null}
            <span>{p.snapshot.positionCount} pos</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function DirectionBadge({
  direction,
  significant,
}: {
  direction: TrendDirection;
  significant: boolean;
}) {
  if (direction === "unknown") {
    return (
      <Badge variant="outline" className="border-muted-foreground/30 text-muted-foreground">
        <HelpCircle className="mr-1 h-2.5 w-2.5" />?
      </Badge>
    );
  }
  if (!significant) {
    return (
      <Badge variant="outline" className="border-muted-foreground/30 text-muted-foreground">
        <Minus className="mr-1 h-2.5 w-2.5" />stabiel
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px]",
        direction === "improving" && "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
        direction === "worsening" && "border-rose-500/40 bg-rose-500/10 text-rose-200",
        direction === "stable" && "border-muted-foreground/30 text-muted-foreground",
      )}
    >
      {direction === "improving" ? "beter" : direction === "worsening" ? "slechter" : "stabiel"}
    </Badge>
  );
}

// ============================================================
//  Formatters / tone helpers
// ============================================================

function formatValue(value: number | null, unit: TrendDelta["unit"]): string {
  if (value === null) return "—";
  switch (unit) {
    case "score":
      return `${Math.round(value)}/100`;
    case "fraction":
      return `${(value * 100).toFixed(1)}%`;
    case "percent":
      return `${(value * 100).toFixed(1)}%`;
    case "count":
      return `${value}`;
  }
}

function formatChange(change: number, unit: TrendDelta["unit"]): string {
  const sign = change > 0 ? "+" : "";
  switch (unit) {
    case "score":
      return `${sign}${change.toFixed(1)}`;
    case "fraction":
    case "percent":
      return `${sign}${(change * 100).toFixed(1)}%-pt`;
    case "count":
      return `${sign}${change}`;
  }
}

function directionIcon(direction: TrendDirection) {
  if (direction === "improving") return TrendingUp;
  if (direction === "worsening") return TrendingDown;
  return Minus;
}

function directionText(direction: TrendDirection): string {
  if (direction === "improving") return "text-emerald-300";
  if (direction === "worsening") return "text-rose-300";
  return "text-muted-foreground";
}

function directionBorder(direction: TrendDirection): string {
  if (direction === "improving") return "border-emerald-500/30";
  if (direction === "worsening") return "border-rose-500/30";
  return "border-border/40";
}
