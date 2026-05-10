import { Globe, ShieldAlert, TrendingDown, TrendingUp } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Section } from "@/components/common/section";
import { IndicatorRow } from "@/components/macro-regime/indicator-row";
import { Badge } from "@/components/ui/badge";
import { buildPortfolioView } from "@/lib/analytics";
import {
  loadMacroRegimeReport,
  MACRO_REGIME_DESCRIPTIONS,
  MACRO_REGIME_LABELS,
  type ImpactDirection,
} from "@/lib/analytics/macro-regime";
import { resolveUserFromServer } from "@/lib/auth";
import { portfolioRepository } from "@/lib/data";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Macroregime",
};

export const dynamic = "force-dynamic";

/**
 * /macro — volledige Macro Regime Engine output.
 *
 * Drie secties:
 *  1. Huidig regime (label + narrative + confidence)
 *  2. 7 indicators in vaste volgorde
 *  3. Asset-class impact (10 buckets) + portfolio-impact (als view)
 *
 * Methodologie-blok onderaan met links naar de docs.
 */

export default async function MacroPage() {
  const auth = await resolveUserFromServer();
  if (!auth.ok) {
    return (
      <>
        <PageHeader
          eyebrow="Markt"
          title="Macroregime"
          description="Authenticatie vereist."
        />
        <EmptyState icon={ShieldAlert} title="Niet ingelogd" description={auth.error} />
      </>
    );
  }

  const portfolio = await portfolioRepository
    .findPrimaryByEmail(auth.user.email)
    .catch(() => null);
  const view = portfolio
    ? await buildPortfolioView(portfolio, {
        includeFundamentals: true,
        includeFactorScores: true,
      })
    : null;

  const report = await loadMacroRegimeReport({ view });
  const { classification, assetMapping, portfolioImpact } = report;

  return (
    <>
      <PageHeader
        eyebrow="Markt"
        title={`Macroregime · ${MACRO_REGIME_LABELS[classification.regime]}`}
        description={classification.narrative}
        actions={
          <Badge variant="outline" className="text-[10px]">
            Confidence {Math.round(classification.confidence * 100)}%
          </Badge>
        }
      />

      <Section
        title="Indicators"
        description="Zeven macro-indicators die samen het regime bepalen. Score is genormaliseerd 0..100 (50 = neutraal); de richting (stijgend/dalend) bepaalt de quadrant-keuze."
      >
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {classification.indicators.map((indicator) => (
            <IndicatorRow key={indicator.key} indicator={indicator} />
          ))}
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 text-[11px] lg:grid-cols-2">
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2 text-emerald-200">
            <strong>Bevestigend ({classification.supportingIndicators.length}):</strong>{" "}
            {classification.supportingIndicators.length === 0
              ? "geen"
              : classification.supportingIndicators.join(" · ")}
          </div>
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-amber-200">
            <strong>Tegenstrijdig ({classification.conflictingIndicators.length}):</strong>{" "}
            {classification.conflictingIndicators.length === 0
              ? "geen"
              : classification.conflictingIndicators.join(" · ")}
          </div>
        </div>
      </Section>

      <Section
        title="Asset-class impact"
        description="Welke beleggingscategorieën krijgen historisch tail- of headwind in dit regime. Geen koop-/verkoopadvies — een ‘wat-werkt-historisch’-tabel."
      >
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {assetMapping.impacts.map((impact) => (
            <div
              key={impact.assetClass}
              className={cn(
                "rounded-md border p-3 text-sm",
                impact.direction === "tailwind"
                  ? "border-emerald-500/40 bg-emerald-500/5"
                  : impact.direction === "headwind"
                    ? "border-amber-500/40 bg-amber-500/5"
                    : "border-border/40 bg-surface/40",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-semibold text-foreground">{impact.label}</h4>
                <DirectionBadge direction={impact.direction} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {impact.rationale}
              </p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Sterkte: {Math.round(impact.magnitude * 100)}%
              </p>
            </div>
          ))}
        </div>
      </Section>

      {portfolioImpact && (
        <Section
          title="Impact op je portefeuille"
          description={`Alignment-score ${portfolioImpact.alignmentScore}/100. ${portfolioImpact.summary}`}
        >
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {portfolioImpact.buckets.map((bucket) => (
              <div
                key={bucket.assetClass}
                className="rounded-md border border-border/40 bg-surface/40 p-3 text-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <h4 className="font-semibold text-foreground">{bucket.label}</h4>
                  <DirectionBadge direction={bucket.direction} />
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-[10px] text-muted-foreground">
                  <div>
                    <p className="uppercase tracking-wider">Huidig</p>
                    <p className="mt-0.5 font-mono text-xs text-foreground">
                      {(bucket.currentWeight * 100).toFixed(1)}%
                    </p>
                  </div>
                  <div>
                    <p className="uppercase tracking-wider">Baseline</p>
                    <p className="mt-0.5 font-mono text-xs text-foreground">
                      {(bucket.regimeBaseline * 100).toFixed(1)}%
                    </p>
                  </div>
                  <div>
                    <p className="uppercase tracking-wider">Gap</p>
                    <p
                      className={cn(
                        "mt-0.5 flex items-center gap-1 font-mono text-xs",
                        bucket.gap > 0
                          ? "text-amber-300"
                          : bucket.gap < 0
                            ? "text-blue-300"
                            : "text-muted-foreground",
                      )}
                    >
                      {bucket.gap > 0 ? (
                        <TrendingUp className="h-2.5 w-2.5" aria-hidden />
                      ) : bucket.gap < 0 ? (
                        <TrendingDown className="h-2.5 w-2.5" aria-hidden />
                      ) : null}
                      {bucket.gap > 0 ? "+" : ""}
                      {(bucket.gap * 100).toFixed(1)}%
                    </p>
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {bucket.rationale}
                </p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {!portfolioImpact && (
        <EmptyState
          icon={Globe}
          title="Geen portefeuille gekoppeld"
          description="Voeg een portefeuille toe om per asset-class te zien hoe het regime jouw weging raakt."
        />
      )}

      <Section
        title="Methodologie"
        description="Hoe de classificatie tot stand komt."
      >
        <div className="rounded-lg border border-border/60 bg-surface/40 p-4 text-xs text-muted-foreground">
          <p>
            <strong className="text-foreground">Classificatie</strong> is een
            quadrant op (groei × inflatie). De andere 5 indicators (rente,
            liquiditeit, recessierisico, volatiliteit, sentiment) bevestigen of
            zwakken de classificatie af — dat bepaalt de confidence-score.
          </p>
          <p className="mt-2">
            <strong className="text-foreground">{MACRO_REGIME_LABELS[classification.regime]}</strong>:{" "}
            {MACRO_REGIME_DESCRIPTIONS[classification.regime]}
          </p>
          <p className="mt-2">
            <strong className="text-foreground">Data-bron</strong>: composite
            (DB-snapshot waar beschikbaar, anders seed-fallback). Drempels en
            tabellen staan in{" "}
            <code className="rounded bg-muted/30 px-1">docs/MACRO_REGIME.md</code>
            .
          </p>
        </div>
      </Section>
    </>
  );
}

function DirectionBadge({ direction }: { direction: ImpactDirection }) {
  const label =
    direction === "tailwind" ? "Rugwind" : direction === "headwind" ? "Tegenwind" : "Neutraal";
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px]",
        direction === "tailwind"
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
          : direction === "headwind"
            ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
            : "border-border/40",
      )}
    >
      {label}
    </Badge>
  );
}
