import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Download,
  FileBarChart2,
  Lightbulb,
  Microscope,
  ShieldAlert,
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
import {
  DECAY_PATTERN_LABELS,
  HORIZON_LABELS,
  REGIME_LABELS,
  SIGNAL_COMPONENT_LABELS,
  loadSignalPerformanceReport,
  type ReturnHorizon,
  type SignalComponentPerformance,
  type SignalDecayPattern,
} from "@/lib/analytics/signal-performance";
import {
  canUseFeature,
  getFeature,
  resolveCurrentTier,
} from "@/lib/entitlements";

export const metadata = {
  title: "Signal Performance Lab",
};

export const dynamic = "force-dynamic";

/**
 * /research/signals — Signal Performance Lab (Module 27).
 *
 * Entitlement: `research.signal_performance` (ELITE + ADVISOR).
 * Geen overfit-magie: alle drempels `const`, sample-size warnings expliciet.
 */
export default async function SignalPerformancePage() {
  const auth = await resolveUserFromServer();
  if (!auth.ok) {
    return (
      <>
        <PageHeader
          eyebrow="Research"
          title="Signal Performance Lab"
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

  const tierResult = await resolveCurrentTier(auth.user.email);
  const ent = canUseFeature(tierResult.tier, "research.signal_performance", {
    overrideActive: tierResult.overrideActive,
  });

  if (!ent.allowed) {
    const feature = getFeature("research.signal_performance")!;
    return (
      <>
        <PageHeader
          eyebrow="Research"
          title="Signal Performance Lab"
          description="Research-grade backtest per signaal-component — voor Elite en Advisor."
        />
        <Section
          title="Wat krijg je?"
          description="Geen black box: per signaal-component hoe vaak en wanneer het historisch werkte."
        >
          <PreviewGrid />
          <PaywallCard
            featureLabel={feature.label}
            description={feature.description}
            entitlement={ent}
            bonusCopy="Per-horizon hit-rate (1m/3m/6m/12m), regime-breakdown (risk-on / neutraal / defensief), false-positive/negative counts, decay-pattern en CSV-export. Inclusief verplichte sample-size en disclaimer-warnings."
          />
        </Section>
      </>
    );
  }

  const report = await loadSignalPerformanceReport({});

  return (
    <>
      <PageHeader
        eyebrow="Research"
        title="Signal Performance Lab"
        description={`Hoe vaak werkten signalen historisch? ${report.totalObservations} observaties.`}
        actions={
          <div className="flex gap-2">
            <Badge variant="outline" className="text-[10px]">
              ELITE · Research
            </Badge>
            <Button asChild size="sm" variant="outline">
              <Link
                href={"/api/research/signals/csv" as never}
                target="_blank"
              >
                <Download className="mr-1 h-3 w-3" />
                CSV
              </Link>
            </Button>
          </div>
        }
      />

      {report.globalWarning ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-200">
          <p className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{report.globalWarning}</span>
          </p>
        </div>
      ) : null}

      <Section
        title="Per-component performance"
        description="Hit-rate per horizon + decay-pattern. Information Coefficient (IC) is Spearman-rank correlatie tussen score en forward-return — >+0.05 = positief signaal."
      >
        {report.totalObservations === 0 ? (
          <EmptyState
            icon={FileBarChart2}
            title="Nog geen historische data"
            description="Het Signal Performance Lab werkt op historische FactorSnapshots. Zodra de scoring-pipeline regelmatig snapshots wegschrijft, vult deze pagina zich vanzelf."
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {report.components.map((comp) => (
              <ComponentCard
                key={comp.component}
                component={comp.component}
                byHorizon={comp.byHorizon}
                decayPattern={comp.decayPattern}
                summary={comp.summary}
              />
            ))}
          </div>
        )}
      </Section>

      {report.totalObservations > 0 ? (
        <Section
          title="Regime-breakdown (12m)"
          description="In welk regime werkt elk signaal het sterkst? Cellen tonen sample-size + mean-return — leeg veld = onvoldoende data."
        >
          <div className="overflow-x-auto rounded-md border border-border/40 bg-surface/40">
            <table className="w-full text-left text-[11px]">
              <thead className="bg-muted/20 text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5">Component</th>
                  {(["RISK_ON", "NEUTRAL", "DEFENSIVE", "UNKNOWN"] as const).map(
                    (r) => (
                      <th key={r} className="px-2 py-1.5">
                        {REGIME_LABELS[r]}
                      </th>
                    ),
                  )}
                  <th className="px-2 py-1.5">Best</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {report.regimeBreakdowns.map((br) => (
                  <tr
                    key={br.component}
                    className="border-t border-border/30 align-top"
                  >
                    <td className="px-2 py-1.5 text-foreground">
                      {SIGNAL_COMPONENT_LABELS[br.component]}
                    </td>
                    {(
                      ["RISK_ON", "NEUTRAL", "DEFENSIVE", "UNKNOWN"] as const
                    ).map((r) => {
                      const cell = br.byRegime.find((c) => c.regime === r);
                      if (!cell || cell.sampleSize === 0) {
                        return (
                          <td
                            key={r}
                            className="px-2 py-1.5 text-muted-foreground"
                          >
                            —
                          </td>
                        );
                      }
                      return (
                        <td key={r} className="px-2 py-1.5">
                          <div>
                            n={cell.sampleSize}
                          </div>
                          <div
                            className={
                              cell.meanReturn !== null && cell.meanReturn > 0
                                ? "text-emerald-300"
                                : cell.meanReturn !== null && cell.meanReturn < 0
                                  ? "text-rose-300"
                                  : "text-muted-foreground"
                            }
                          >
                            {cell.meanReturn !== null
                              ? `${(cell.meanReturn * 100).toFixed(1)}%`
                              : "—"}
                          </div>
                        </td>
                      );
                    })}
                    <td className="px-2 py-1.5 text-emerald-300">
                      {br.bestRegime ? REGIME_LABELS[br.bestRegime] : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ) : null}

      <Section
        title="Hoe lezen?"
        description="Onzekerheid expliciet — geen schijnzekerheid."
      >
        <div className="rounded-md border border-border/60 bg-surface/40 p-4 text-xs text-muted-foreground">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Hit-rate</strong> &gt; 50% = beter dan random. Onder
              55% = zwak; boven 60% = sterk; boven 65% = uitzonderlijk (let
              dan extra op overfitting).
            </li>
            <li>
              <strong>IC (Information Coefficient)</strong>: Spearman-rank
              correlatie score ↔ forward-return. +0.05 = bruikbaar signaal in
              factor-research; +0.10 = sterk.
            </li>
            <li>
              <strong>Long-short spread</strong> = gemiddelde return van
              top-quintile (score ≥ 80) MINUS bottom-quintile (score &lt; 20).
              Positief = signaal scheidt winnaars van verliezers.
            </li>
            <li>
              <strong>Decay-pattern</strong>: verzwakt het signaal over tijd
              (typisch momentum), wordt het sterker (typisch quality), of
              piekt het in het midden (typisch valuation)?
            </li>
            <li>
              <strong>Sample size</strong>: onder 30 observaties → warning
              gerendert. Geen claim van significantie tot sample groeit.
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
        icon={Microscope}
        label="6 componenten"
        body="Quality, valuation, momentum, volatility, macrofit, portfoliofit — apart geanalyseerd."
      />
      <PreviewItem
        icon={FileBarChart2}
        label="4 horizons"
        body="1m / 3m / 6m / 12m forward-returns met hit-rate + IC + long-short-spread per horizon."
      />
      <PreviewItem
        icon={Download}
        label="CSV-export"
        body="Excel/Sheets-vriendelijk: rapport in 3 secties met sample-sizes en warnings inbegrepen."
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

function ComponentCard({
  component,
  byHorizon,
  decayPattern,
  summary,
}: {
  component: keyof typeof SIGNAL_COMPONENT_LABELS;
  byHorizon: SignalComponentPerformance[];
  decayPattern: SignalDecayPattern;
  summary: string;
}) {
  return (
    <Card className="border-border/60">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">
            {SIGNAL_COMPONENT_LABELS[component]}
          </p>
          <Badge variant="outline" className="text-[10px]">
            {DECAY_PATTERN_LABELS[decayPattern]}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">{summary}</p>
        <div className="overflow-x-auto">
          <table className="w-full text-[10px]">
            <thead className="text-muted-foreground">
              <tr>
                <th className="text-left">Horizon</th>
                <th className="text-right">n</th>
                <th className="text-right">Hit</th>
                <th className="text-right">IC</th>
                <th className="text-right">Spread</th>
                <th className="text-right">FP/FN</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {(["1m", "3m", "6m", "12m"] as ReturnHorizon[]).map((h) => {
                const row = byHorizon.find((b) => b.horizon === h);
                if (!row) return null;
                const hitTone =
                  row.hitRate !== null && row.hitRate >= 0.55
                    ? "text-emerald-300"
                    : row.hitRate !== null && row.hitRate <= 0.45
                      ? "text-rose-300"
                      : "text-foreground";
                return (
                  <tr key={h} className="border-t border-border/30">
                    <td className="py-1 text-foreground">
                      {HORIZON_LABELS[h]}
                    </td>
                    <td className="py-1 text-right">{row.sampleSize}</td>
                    <td className={`py-1 text-right ${hitTone}`}>
                      {row.hitRate !== null
                        ? `${Math.round(row.hitRate * 100)}%`
                        : "—"}
                    </td>
                    <td className="py-1 text-right">
                      {row.informationCoefficient !== null ? (
                        <span
                          className={
                            row.informationCoefficient > 0.05
                              ? "text-emerald-300"
                              : row.informationCoefficient < -0.05
                                ? "text-rose-300"
                                : "text-muted-foreground"
                          }
                        >
                          {row.informationCoefficient > 0 ? (
                            <ArrowUp className="inline h-2.5 w-2.5" />
                          ) : (
                            <ArrowDown className="inline h-2.5 w-2.5" />
                          )}
                          {Math.abs(row.informationCoefficient).toFixed(2)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-1 text-right">
                      {row.longShortSpread !== null
                        ? `${(row.longShortSpread * 100).toFixed(1)}%`
                        : "—"}
                    </td>
                    <td className="py-1 text-right text-muted-foreground">
                      {row.falsePositiveCount}/{row.falseNegativeCount}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
