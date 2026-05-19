import {
  Activity,
  AlertTriangle,
  Download,
  GitMerge,
  Lightbulb,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Section } from "@/components/common/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PaywallCard } from "@/components/entitlements/paywall-card";
import { resolveUserFromServer } from "@/lib/auth";
import { portfolioRepository } from "@/lib/data";
import {
  INSIGHT_LABELS,
  loadCorrelationReport,
  type CorrelationAsset,
  type CorrelationCell,
  type CorrelationInsightKind,
  type CorrelationReport,
} from "@/lib/analytics/correlation";
import {
  canUseFeature,
  getFeature,
  resolveCurrentTier,
} from "@/lib/entitlements";

export const metadata = {
  title: "Cross-Asset Correlation Studio",
};

export const dynamic = "force-dynamic";

/**
 * /research/correlations — Cross-Asset Correlation Studio (Module 28).
 *
 * Entitlement: `research.correlations` (ELITE + ADVISOR).
 * Geen rewrite, geen Prisma-migratie. Pure-function engine + getHistory.
 */
export default async function CorrelationStudioPage() {
  const auth = await resolveUserFromServer();
  if (!auth.ok) {
    return (
      <>
        <PageHeader
          eyebrow="Research"
          title="Correlation Studio"
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

  const tier = await resolveCurrentTier(auth.user.email);
  const ent = canUseFeature(tier.tier, "research.correlations", {
    overrideActive: tier.overrideActive,
  });

  if (!ent.allowed) {
    const feature = getFeature("research.correlations")!;
    return (
      <>
        <PageHeader
          eyebrow="Research"
          title="Cross-Asset Correlation Studio"
          description="Zie hoe jouw posities samen bewegen — voor Elite en Advisor."
        />
        <Section
          title="Wat krijg je?"
          description="Geavanceerde spreidings-analyse voor onderzoekers en gevorderde beleggers."
        >
          <PreviewGrid />
          <PaywallCard
            featureLabel={feature.label}
            description={feature.description}
            entitlement={ent}
            bonusCopy="Paarsgewijze Pearson-correlaties tussen jouw posities + S&P 500, MSCI World en All-World. Diversification-score + concrete inzichten (concentratie-paren, hedge-kandidaten). CSV-export voor verdere analyse."
          />
        </Section>
      </>
    );
  }

  const portfolio = await portfolioRepository
    .findPrimaryByEmail(auth.user.email)
    .catch(() => null);

  if (!portfolio || portfolio.holdings.length === 0) {
    return (
      <>
        <PageHeader
          eyebrow="Research"
          title="Correlation Studio"
          description="Voeg eerst posities toe om correlaties te berekenen."
        />
        <EmptyState
          icon={GitMerge}
          title="Geen posities"
          description="Correlatie-analyse vereist minimaal 2 holdings met genoeg koershistorie (30 trading days)."
        />
      </>
    );
  }

  const report = await loadCorrelationReport({ portfolio });

  return (
    <>
      <PageHeader
        eyebrow="Research"
        title="Cross-Asset Correlation Studio"
        description={`${report.assets.length} assets · ${report.lookbackTradingDays} trading days lookback.`}
        actions={
          <div className="flex gap-2">
            <Badge variant="outline" className="text-[10px]">
              ELITE · Research
            </Badge>
            <Button asChild size="sm" variant="outline">
              <Link
                href={"/api/research/correlations/csv" as never}
                target="_blank"
              >
                <Download className="mr-1 h-3 w-3" />
                CSV
              </Link>
            </Button>
          </div>
        }
      />

      {report.warning ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-200">
          <p className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{report.warning}</span>
          </p>
        </div>
      ) : null}

      <Section
        title="Diversification-score"
        description={`Gewogen gemiddelde van paarsgewijze correlaties. Hoger = minder gecorreleerd = beter gespreid.`}
      >
        <DiversificationCard report={report} />
      </Section>

      {report.insights.length > 0 ? (
        <Section
          title="Top inzichten"
          description="Sterke signalen — gesorteerd op absolute correlatie."
        >
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {report.insights.map((ins) => (
              <Card key={`${ins.tickerA}-${ins.tickerB}`} className="border-border/60">
                <CardContent className="space-y-1.5 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground">
                      {ins.pairLabel}
                    </p>
                    <Badge
                      variant="outline"
                      className={insightBadgeTone(ins.kind)}
                    >
                      {INSIGHT_LABELS[ins.kind]}
                    </Badge>
                  </div>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    Correlatie: <span className={correlationTone(ins.correlation)}>
                      {(ins.correlation * 100).toFixed(0)}%
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">{ins.rationale}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </Section>
      ) : null}

      {report.assets.length >= 2 ? (
        <Section
          title="Correlatie-matrix"
          description={`Pearson-correlatie op daily-returns. Groene cellen = laag/negatief gecorreleerd; rood = hoog gecorreleerd.`}
        >
          <MatrixView report={report} />
        </Section>
      ) : null}

      <Section
        title="Hoe lezen?"
        description="Wat betekenen deze cijfers in de praktijk?"
      >
        <div className="rounded-md border border-border/60 bg-surface/40 p-4 text-xs text-muted-foreground">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Pearson-correlatie</strong>: -1 (perfect tegengesteld) tot
              +1 (perfect synchroon). 0 = onafhankelijk.
            </li>
            <li>
              <strong>≥ 85%</strong>: posities bewegen vrijwel identiek —
              concentratie-risico zonder extra spreiding.
            </li>
            <li>
              <strong>50%–85%</strong>: matig gecorreleerd — verwacht.
            </li>
            <li>
              <strong>−20% tot +20%</strong>: vrijwel onafhankelijk — sterke
              diversifier.
            </li>
            <li>
              <strong>≤ −30%</strong>: negatieve correlatie — potentiële
              hedge.
            </li>
            <li>
              <strong>Sample size &lt; 30 trading days</strong>: cell wordt
              uitgesloten van score (te weinig data).
            </li>
          </ul>
        </div>
      </Section>

      <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-[11px] text-amber-100">
        <p className="flex items-start gap-2">
          <Lightbulb className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          <span>{report.disclaimer}</span>
        </p>
      </div>
    </>
  );
}

function PreviewGrid() {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <PreviewItem
        icon={Activity}
        label="Paarsgewijze matrix"
        body="Pearson-correlatie tussen al je top-posities (max 15) + 3 brede indices."
      />
      <PreviewItem
        icon={GitMerge}
        label="Concrete inzichten"
        body="Top-10 paren met sterkste signaal: concentratie of hedge."
      />
      <PreviewItem
        icon={Download}
        label="CSV-export"
        body="3-section CSV: matrix + inzichten + disclaimer; klaar voor Excel/Sheets/R."
      />
    </div>
  );
}

function PreviewItem({
  icon: Icon,
  label,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  body: string;
}) {
  return (
    <Card className="border-border/60 bg-surface/40">
      <CardContent className="space-y-2 p-4">
        <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          <Icon className="h-3 w-3" /> {label}
        </p>
        <p className="text-xs text-muted-foreground">{body}</p>
      </CardContent>
    </Card>
  );
}

function DiversificationCard({ report }: { report: CorrelationReport }) {
  const tone = scoreTone(report.diversificationScore);
  return (
    <Card className="border-border/60">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-baseline gap-3">
          <span className={`font-mono text-4xl font-bold ${tone}`}>
            {report.diversificationScore}
          </span>
          <span className="text-sm text-muted-foreground">/ 100</span>
          <Badge variant="outline" className="ml-auto text-[10px]">
            {report.diversificationVerdict}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Score berekend over {report.cells.filter((c) => c.correlation !== null).length}{" "}
          bruikbare correlatie-paren tussen {report.assets.length} assets.
        </p>
      </CardContent>
    </Card>
  );
}

function MatrixView({ report }: { report: CorrelationReport }) {
  // Bouw map (i,j) → cell voor snelle lookup.
  const cellMap = new Map<string, CorrelationCell>();
  for (const c of report.cells) {
    cellMap.set(`${c.i}-${c.j}`, c);
    cellMap.set(`${c.j}-${c.i}`, c);
  }

  return (
    <div className="overflow-x-auto rounded-md border border-border/40 bg-surface/40">
      <table className="text-[10px]">
        <thead className="bg-muted/20 text-[9px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="sticky left-0 z-10 bg-muted/30 px-2 py-1.5 text-left">
              Asset
            </th>
            {report.assets.map((a, j) => (
              <th key={j} className="px-1 py-1.5 text-center" title={a.name}>
                {a.ticker.slice(0, 6)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="font-mono">
          {report.assets.map((rowAsset, i) => (
            <tr key={i} className="border-t border-border/30">
              <td
                className="sticky left-0 z-10 bg-surface/80 px-2 py-1 text-left"
                title={rowAsset.name}
              >
                <span className="font-semibold text-foreground">
                  {rowAsset.ticker.slice(0, 6)}
                </span>
                <span className="ml-1 text-[9px] uppercase text-muted-foreground">
                  {rowAsset.kind === "benchmark" ? "BM" : ""}
                </span>
              </td>
              {report.assets.map((_, j) => (
                <CorrelationMatrixCell
                  key={j}
                  i={i}
                  j={j}
                  cell={i === j ? null : (cellMap.get(`${i}-${j}`) ?? null)}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CorrelationMatrixCell({
  i,
  j,
  cell,
}: {
  i: number;
  j: number;
  cell: CorrelationCell | null;
}) {
  if (i === j) {
    return (
      <td className="px-1 py-1 text-center text-muted-foreground">—</td>
    );
  }
  if (!cell || cell.correlation === null) {
    return (
      <td className="px-1 py-1 text-center text-muted-foreground">·</td>
    );
  }
  const cor = cell.correlation;
  const bg = correlationBg(cor);
  return (
    <td
      className={`px-1 py-1 text-center ${bg}`}
      title={`n=${cell.sampleSize}, cor=${cor.toFixed(3)}`}
    >
      {Math.round(cor * 100)}
    </td>
  );
}

// ============================================================
//  Helpers (color/tone)
// ============================================================

function correlationBg(cor: number): string {
  if (cor >= 0.85) return "bg-rose-600/40 text-rose-50";
  if (cor >= 0.6) return "bg-rose-500/25 text-rose-100";
  if (cor >= 0.3) return "bg-amber-500/20 text-amber-100";
  if (cor >= -0.2) return "bg-surface/40 text-muted-foreground";
  if (cor >= -0.5) return "bg-emerald-500/20 text-emerald-100";
  return "bg-emerald-600/40 text-emerald-50";
}

function correlationTone(cor: number): string {
  if (cor >= 0.7) return "text-rose-300";
  if (cor <= -0.3) return "text-emerald-300";
  return "text-foreground";
}

function insightBadgeTone(kind: CorrelationInsightKind): string {
  switch (kind) {
    case "highly_correlated":
      return "border-rose-500/40 bg-rose-500/10 text-rose-200";
    case "negatively_correlated":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
    case "uncorrelated_diversifier":
      return "border-sky-500/40 bg-sky-500/10 text-sky-200";
    case "moderately_correlated":
      return "border-amber-500/40 bg-amber-500/10 text-amber-200";
  }
}

function scoreTone(score: number): string {
  if (score >= 70) return "text-emerald-200";
  if (score >= 50) return "text-foreground";
  if (score >= 30) return "text-amber-200";
  return "text-rose-200";
}
