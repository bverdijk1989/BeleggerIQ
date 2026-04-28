import { BookOpen, ExternalLink } from "lucide-react";

import { PageHeader } from "@/components/common/page-header";
import { Section } from "@/components/common/section";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ACTION_THRESHOLDS,
} from "@/lib/analytics/holding-action";
import {
  DEFAULT_FACTOR_WEIGHTS,
  MAX_CONFIDENCE_LOW_COVERAGE,
  MIN_COVERAGE_FOR_COMPOSITE,
  MIN_PILLARS_FOR_COMPOSITE,
} from "@/lib/analytics/factors/composite";
import { DEFAULT_ETF_WEIGHTS } from "@/lib/analytics/etf-factors/composite";
import { DEFAULT_RISK_THRESHOLDS } from "@/lib/analytics/risk-engine/thresholds";
import { DEFAULT_REBALANCE_THRESHOLDS } from "@/lib/analytics/rebalance-engine/thresholds";
import { DEFAULT_ALLOCATION_THRESHOLDS } from "@/lib/analytics/allocation-engine/thresholds";

export const metadata = {
  title: "Methodologie",
};

/**
 * Methodologie-pagina. Linkt naar `docs/ENGINES.md` voor de volledige
 * formules en toont een live snapshot van de actieve thresholds zoals
 * ze in de huidige bundle leven — zo blijft deze pagina automatisch
 * synchroon met de runtime-constanten.
 *
 * Doel: een reviewer / belegger kan in één pagina zien waarom een
 * advies wordt gegeven én waar de constanten in de code staan.
 */

const ENGINES_DOC_URL =
  "https://github.com/bverdijk1989/BeleggerIQ/blob/main/docs/ENGINES.md";

const ENGINES = [
  {
    title: "Factor scoring (aandelen + REITs)",
    purpose:
      "Per ticker een 0–100 composite-score op quality, value, momentum en lowVol — met expliciete coverage en confidence.",
    sourcePath: "src/lib/analytics/factors/",
    anchor: "1-factor-scoring-aandelen--reits",
  },
  {
    title: "ETF factor scoring",
    purpose:
      "ETF's beoordelen op fund-eigenschappen (kosten, schaal, track-record, pasvorm) — niet op verzonnen fundamentals.",
    sourcePath: "src/lib/analytics/etf-factors/",
    anchor: "2-etf-factor-scoring-sinds-module-7",
  },
  {
    title: "Regime scoring",
    purpose:
      "Het brede markt-klimaat als één 0–100 score met label RISK_ON / NEUTRAL / DEFENSIVE, zodat allocaties tilten.",
    sourcePath: "src/lib/analytics/regime/",
    anchor: "3-regime-scoring",
  },
  {
    title: "Risk flags",
    purpose:
      "Per portfolio risk-classificaties (low / moderate / high) over concentratie, volatility, drawdown, sector, currency.",
    sourcePath: "src/lib/analytics/risk-engine/",
    anchor: "4-risk-flags",
  },
  {
    title: "Rebalance decisions",
    purpose:
      "Per overweight-positie: HOLD, TRIM_LIGHT, TRIM_HEAVY of RECONSIDER. Houdt rekening met fragility-score.",
    sourcePath: "src/lib/analytics/rebalance-engine/",
    anchor: "5-rebalance-decisions",
  },
  {
    title: "Allocation engine (monthly buy)",
    purpose:
      "Maximaal 5 koop-orders per maand die budget alloceren over high-conviction kandidaten zonder caps te schenden.",
    sourcePath: "src/lib/analytics/allocation-engine/",
    anchor: "6-allocation-engine-monthly-buy",
  },
  {
    title: "Holding-action classifier",
    purpose:
      "Het label dat je per holding ziet: BUY_CANDIDATE / HOLD / WATCH / TRIM / AVOID — afgeleid uit composite + confidence + overweight.",
    sourcePath: "src/lib/analytics/holding-action.ts",
    anchor: "7-holding-action-classifier",
  },
] as const;

function fmtPct(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

export default function MethodologiePage() {
  return (
    <>
      <PageHeader
        eyebrow="Over BeleggerIQ"
        title="Methodologie"
        description="Hoe komt een advies tot stand? Alle engines zijn deterministisch en open. Geen ML-black-box, geen verborgen heuristics."
      />

      <Section
        title="Volledige uitleg per engine"
        description="Voor elke engine is er één pagina met purpose, inputs, formule, thresholds, limitations en voorbeelden."
      >
        <Card>
          <CardContent className="p-5">
            <p className="mb-3 text-sm text-muted-foreground">
              De canonieke methodologie staat in{" "}
              <a
                href={ENGINES_DOC_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                <BookOpen className="h-3.5 w-3.5" />
                docs/ENGINES.md
                <ExternalLink className="h-3 w-3" />
              </a>
              . Hieronder een snelle index plus de huidige actieve
              thresholds — automatisch ingelezen uit de runtime-constanten,
              dus altijd in sync met de code.
            </p>
            <ul className="space-y-2 text-sm">
              {ENGINES.map((e) => (
                <li
                  key={e.title}
                  className="rounded-md border border-border/60 bg-surface/60 p-3"
                >
                  <div className="flex flex-col gap-1 md:flex-row md:items-baseline md:justify-between md:gap-3">
                    <span className="font-medium text-foreground">
                      {e.title}
                    </span>
                    <a
                      href={`${ENGINES_DOC_URL}#${e.anchor}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-primary hover:underline"
                    >
                      Lees uitleg →
                    </a>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {e.purpose}
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                    {e.sourcePath}
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </Section>

      <Section
        title="Live snapshot van constanten"
        description="Deze waarden komen direct uit de runtime-bundle — wijzigt een PR een threshold, dan beweegt deze tabel mee."
      >
        <div className="grid gap-3 md:grid-cols-2">
          <ConstantsCard
            title="Factor scoring"
            rows={[
              ["MIN_COVERAGE_FOR_COMPOSITE", String(MIN_COVERAGE_FOR_COMPOSITE)],
              ["MIN_PILLARS_FOR_COMPOSITE", String(MIN_PILLARS_FOR_COMPOSITE)],
              [
                "MAX_CONFIDENCE_LOW_COVERAGE",
                MAX_CONFIDENCE_LOW_COVERAGE.toFixed(2),
              ],
              [
                "DEFAULT_FACTOR_WEIGHTS",
                JSON.stringify(DEFAULT_FACTOR_WEIGHTS),
              ],
            ]}
          />
          <ConstantsCard
            title="ETF scoring"
            rows={[["DEFAULT_ETF_WEIGHTS", JSON.stringify(DEFAULT_ETF_WEIGHTS)]]}
          />
          <ConstantsCard
            title="Risk flags (default thresholds)"
            rows={[
              [
                "positionWeight",
                `low ≤ ${fmtPct(DEFAULT_RISK_THRESHOLDS.positionWeight.low)} · high ≥ ${fmtPct(DEFAULT_RISK_THRESHOLDS.positionWeight.high)}`,
              ],
              [
                "concentrationHhi",
                `low ≤ ${DEFAULT_RISK_THRESHOLDS.concentrationHhi.low} · high ≥ ${DEFAULT_RISK_THRESHOLDS.concentrationHhi.high}`,
              ],
              [
                "top5Weight",
                `low ≤ ${fmtPct(DEFAULT_RISK_THRESHOLDS.top5Weight.low)} · high ≥ ${fmtPct(DEFAULT_RISK_THRESHOLDS.top5Weight.high)}`,
              ],
              [
                "volatility",
                `low ≤ ${fmtPct(DEFAULT_RISK_THRESHOLDS.volatility.low)} · high ≥ ${fmtPct(DEFAULT_RISK_THRESHOLDS.volatility.high)}`,
              ],
              [
                "drawdown",
                `low ≤ ${fmtPct(DEFAULT_RISK_THRESHOLDS.drawdown.low)} · high ≥ ${fmtPct(DEFAULT_RISK_THRESHOLDS.drawdown.high)}`,
              ],
              [
                "sectorWeight",
                `low ≤ ${fmtPct(DEFAULT_RISK_THRESHOLDS.sectorWeight.low)} · high ≥ ${fmtPct(DEFAULT_RISK_THRESHOLDS.sectorWeight.high)}`,
              ],
              ["minPositions", String(DEFAULT_RISK_THRESHOLDS.minPositions)],
            ]}
          />
          <ConstantsCard
            title="Rebalance"
            rows={[
              [
                "maxPositionWeight",
                fmtPct(DEFAULT_REBALANCE_THRESHOLDS.maxPositionWeight),
              ],
              [
                "concentratedMinWeight",
                fmtPct(DEFAULT_REBALANCE_THRESHOLDS.concentratedMinWeight),
              ],
              [
                "healthyRunMultiplier",
                `${DEFAULT_REBALANCE_THRESHOLDS.healthyRunMultiplier}× cap`,
              ],
              [
                "fragileHeavyMultiplier",
                `${DEFAULT_REBALANCE_THRESHOLDS.fragileHeavyMultiplier}× cap`,
              ],
              [
                "fragileReconsiderScore",
                `${DEFAULT_REBALANCE_THRESHOLDS.fragileReconsiderScore}/100`,
              ],
            ]}
          />
          <ConstantsCard
            title="Allocation (monthly buy)"
            rows={[
              [
                "minOrderAmount",
                `${DEFAULT_ALLOCATION_THRESHOLDS.minOrderAmount}`,
              ],
              [
                "maxRecommendations",
                String(DEFAULT_ALLOCATION_THRESHOLDS.maxRecommendations),
              ],
              [
                "cashBufferPct",
                fmtPct(DEFAULT_ALLOCATION_THRESHOLDS.cashBufferPct),
              ],
              [
                "maxPositionWeight",
                fmtPct(DEFAULT_ALLOCATION_THRESHOLDS.maxPositionWeight),
              ],
              [
                "maxSectorWeight",
                fmtPct(DEFAULT_ALLOCATION_THRESHOLDS.maxSectorWeight),
              ],
              [
                "defensiveBudgetHoldback",
                fmtPct(DEFAULT_ALLOCATION_THRESHOLDS.defensiveBudgetHoldback),
              ],
              [
                "minCandidateComposite",
                `${DEFAULT_ALLOCATION_THRESHOLDS.minCandidateComposite}/100`,
              ],
            ]}
          />
          <ConstantsCard
            title="Holding-action classifier"
            rows={[
              ["buyMin", `${ACTION_THRESHOLDS.buyMin}/100`],
              ["holdMin", `${ACTION_THRESHOLDS.holdMin}/100`],
              ["trimMax", `${ACTION_THRESHOLDS.trimMax}/100`],
              ["avoidMax", `${ACTION_THRESHOLDS.avoidMax}/100`],
              [
                "minConfidence",
                ACTION_THRESHOLDS.minConfidence.toFixed(2),
              ],
              [
                "trimOverweightMultiplier",
                `${ACTION_THRESHOLDS.trimOverweightMultiplier}×`,
              ],
            ]}
          />
        </div>
      </Section>

      <Section
        title="Geen black-box garantie"
        description="Wat we expliciet NIET doen — zodat je weet waar je niet hoeft te zoeken."
      >
        <Card>
          <CardContent className="space-y-2 p-5 text-sm">
            <p>
              <strong>Geen ML-fitting.</strong> Geen factor-coefficient is op
              data getraind. Alle gewichten zijn handgekozen, gedocumenteerd
              en versioned.
            </p>
            <p>
              <strong>Geen verborgen sectorbias.</strong> Sector-, factor-
              en regime-keuzes komen uit jouw beleggersprofiel; zie{" "}
              <a className="text-primary hover:underline" href="/profiel">
                /profiel
              </a>{" "}
              voor wat de engines van jou aannemen.
            </p>
            <p>
              <strong>Geen broker-uitvoering.</strong> Alle adviezen zijn
              suggesties. Je plaatst orders zelf bij je broker — zie de
              export-knop op{" "}
              <a
                className="text-primary hover:underline"
                href="/maandbeslissing"
              >
                /maandbeslissing
              </a>
              .
            </p>
            <p>
              <strong>Geen formeel belastingadvies.</strong> Box-3 helpers
              op{" "}
              <a className="text-primary hover:underline" href="/belasting">
                /belasting
              </a>{" "}
              zijn een transparante samenvatting; verifieer altijd met een
              accountant of de Belastingdienst.
            </p>
          </CardContent>
        </Card>
      </Section>
    </>
  );
}

function ConstantsCard({
  title,
  rows,
}: {
  title: string;
  rows: Array<[string, string]>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="space-y-1 text-xs">
          {rows.map(([k, v]) => (
            <div
              key={k}
              className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/40 py-1 last:border-b-0"
            >
              <dt className="font-mono text-muted-foreground">{k}</dt>
              <dd className="font-mono tabular-nums text-foreground">{v}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
