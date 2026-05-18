/**
 * Advisor PDF Report — builder (Module 23).
 *
 * Pure functie: portfolio-view + sub-reports → `AdvisorReportData`.
 * Geen I/O, geen Date.now, deterministisch.
 *
 * **Buffett-laag**: actiepunten zijn aandachtspunten, geen koop/verkoop-
 * orders. Disclaimer-laag eerst.
 * **Lynch-laag**: actiepunten in gewone taal, max 5.
 * **Simons-laag**: per-actiepunt traceable naar bron-engine.
 * **Dalio-laag**: worst-case scenario altijd boven; severity-matrix
 * dwingt prioritering.
 */

import type { ISODateString } from "@/types/common";

import {
  buildReportSpec,
  type Organization,
} from "@/lib/enterprise";
import {
  DEFAULT_WHITE_LABEL,
  type WhiteLabelConfig,
} from "@/lib/enterprise/types";

import type { BehavioralReport } from "@/lib/analytics/behavioral/types";
import {
  BEHAVIORAL_LABELS,
  BEHAVIORAL_SEVERITY_RANK,
} from "@/lib/analytics/behavioral/types";
import type {
  StressTestReport,
  StressTestResult,
} from "@/lib/analytics/stress-tests/types";
import type { WealthDashboardReport } from "@/lib/analytics/wealth/types";
import type { PortfolioView } from "@/lib/analytics/portfolio-view";
import type { AllocationSlice } from "@/types/allocation";

import type {
  AdvisorReportData,
  ReportActionItem,
  ReportAllocationSection,
  ReportBehavioralSection,
  ReportDataQualitySection,
  ReportGoalsSection,
  ReportHealthSection,
  ReportRisksSection,
  ReportScenarioRow,
  ReportScenariosSection,
  ReportTitleSection,
} from "./types";

export interface BuildAdvisorReportInput {
  generatedAt: ISODateString;
  asOf: ISODateString;
  /** Display-naam — bv. e-mail of "Cliënt #1234". Geen secret-data. */
  clientLabel: string;
  generatedBy: string;
  generatedByUserId: string;
  portfolioId: string;
  view: PortfolioView;
  /** Welke fundamentals zijn aanwezig? Voor data-quality-meting. */
  fundamentalsCoverage?: {
    withFundamentals: number;
    withFactorScore: number;
  };
  wealth?: WealthDashboardReport | null;
  stress?: StressTestReport | null;
  behavioral?: BehavioralReport | null;
  organization?: Pick<Organization, "id" | "jurisdiction" | "whiteLabel"> | null;
  advisorNote?: string | null;
  /** Override default white-label (voor previewer). */
  whiteLabelOverride?: WhiteLabelConfig | null;
}

const ALL_REPORT_SECTIONS = [
  "summary",
  "allocation",
  "risk",
  "performance",
  "scenario",
  "holdings",
  "appendix",
] as const;

export function buildAdvisorReportData(
  input: BuildAdvisorReportInput,
): AdvisorReportData {
  // Hergebruik enterprise-report-spec voor disclaimer-selectie zodat
  // jurisdictie-keuze + versie-tracking centraal blijft.
  const spec = buildReportSpec({
    generatedByUserId: input.generatedByUserId,
    organization: input.organization ?? null,
    portfolioId: input.portfolioId,
    asOf: input.asOf,
    sections: ALL_REPORT_SECTIONS,
  });

  const whiteLabel =
    input.whiteLabelOverride ?? spec.whiteLabel ?? DEFAULT_WHITE_LABEL;

  return {
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    asOf: input.asOf,
    whiteLabel,
    disclaimers: spec.disclaimers,
    title: buildTitleSection({
      brandName: whiteLabel.brandName,
      clientLabel: input.clientLabel,
      generatedBy: input.generatedBy,
      asOf: input.asOf,
      advisorNote: input.advisorNote ?? null,
    }),
    health: buildHealthSection(input.view),
    risks: buildRisksSection(input.view),
    allocation: buildAllocationSection(input.view),
    goals: buildGoalsSection(input.wealth ?? null),
    scenarios: buildScenariosSection(input.stress ?? null),
    behavioral: buildBehavioralSection(input.behavioral ?? null),
    dataQuality: buildDataQualitySection(input.view, input.fundamentalsCoverage),
    actionItems: { items: buildActionItems(input) },
  };
}

// ============================================================
//  Section-builders
// ============================================================

function buildTitleSection(input: {
  brandName: string;
  clientLabel: string;
  generatedBy: string;
  asOf: ISODateString;
  advisorNote: string | null;
}): ReportTitleSection {
  return {
    brandName: input.brandName,
    title: "Portefeuille-rapportage",
    clientLabel: input.clientLabel,
    generatedBy: input.generatedBy,
    asOf: input.asOf,
    advisorNote: input.advisorNote,
  };
}

function buildHealthSection(view: PortfolioView): ReportHealthSection {
  const h = view.health;
  return {
    score: Math.round(h.score),
    grade: h.grade,
    components: [
      { label: "Spreiding", score: Math.round(h.diversificationScore) },
      { label: "Kwaliteit", score: Math.round(h.qualityScore) },
      { label: "Risico-alignment", score: Math.round(h.riskAlignmentScore) },
      { label: "Factor-alignment", score: Math.round(h.factorAlignmentScore) },
    ].concat(
      typeof h.regimeAlignmentScore === "number"
        ? [{ label: "Macro-fit", score: Math.round(h.regimeAlignmentScore) }]
        : [],
    ),
    topSignals: h.signals
      .slice()
      .sort(
        (a, b) =>
          healthSeverityWeight(b.severity) - healthSeverityWeight(a.severity),
      )
      .slice(0, 3)
      .map((s) => ({
        label: s.label,
        severity: s.severity,
        message: s.message,
      })),
  };
}

function buildRisksSection(view: PortfolioView): ReportRisksSection {
  const r = view.risk;
  const topFlags = r.flags
    .slice()
    .sort((a, b) => severityWeight(b.severity) - severityWeight(a.severity))
    .slice(0, 5)
    .map((f) => ({
      code: f.code,
      label: f.label,
      severity: f.severity,
      message: f.message ?? "",
      metric: typeof f.metric === "number" ? f.metric : null,
      threshold: typeof f.threshold === "number" ? f.threshold : null,
    }));

  return {
    overallSeverity: r.overallSeverity,
    topFlags,
    metrics: {
      largestPositionWeight: r.largestPositionWeight,
      top5Weight: typeof r.top5Weight === "number" ? r.top5Weight : null,
      portfolioVolatility:
        typeof r.portfolioVolatility === "number"
          ? r.portfolioVolatility
          : null,
      foreignCurrencyExposure:
        typeof r.foreignCurrencyExposure === "number"
          ? r.foreignCurrencyExposure
          : null,
    },
  };
}

function buildAllocationSection(view: PortfolioView): ReportAllocationSection {
  const s = view.summary;
  const cashWeight =
    s.totalValue > 0 ? (s.cashBalance ?? 0) / s.totalValue : 0;
  return {
    totalValue: s.totalValue,
    baseCurrency: s.baseCurrency,
    cashWeight,
    byAssetClass: mapAllocation(s.allocationByAssetClass),
    bySector: mapAllocation(s.allocationBySector),
    byRegion: mapAllocation(s.allocationByRegion),
    byCurrency: mapAllocation(s.allocationByCurrency),
  };
}

function buildGoalsSection(
  wealth: WealthDashboardReport | null,
): ReportGoalsSection | null {
  if (!wealth) return null;
  return {
    totalGoals: wealth.course.totalGoals,
    achievableGoals: wealth.course.achievableGoals,
    courseStatus: wealth.course.status,
    rows: wealth.goals.slice(0, 10).map((g) => ({
      name: g.goal.name,
      type: g.goal.type,
      targetAmount: g.goal.targetAmount,
      targetDate: g.goal.targetDate,
      progress: g.progress,
      feasibilityTier: g.feasibilityTier,
    })),
  };
}

function buildScenariosSection(
  stress: StressTestReport | null,
): ReportScenariosSection | null {
  if (!stress) return null;
  const mapRow = (r: StressTestResult): ReportScenarioRow => ({
    scenario: r.scenario,
    label: r.label,
    severity: r.severity,
    impactPct: r.portfolioImpactPct,
    impactAmount: r.portfolioImpactAmount,
    verdict: r.verdict,
  });
  return {
    worst: stress.worst ? mapRow(stress.worst) : null,
    best: stress.best ? mapRow(stress.best) : null,
    rows: stress.results.map(mapRow),
  };
}

function buildBehavioralSection(
  report: BehavioralReport | null,
): ReportBehavioralSection {
  if (!report) {
    return {
      activeCount: 0,
      counts: { low: 0, moderate: 0, elevated: 0, high: 0 },
      topSignals: [],
    };
  }
  const sorted = report.signals
    .slice()
    .sort(
      (a, b) =>
        BEHAVIORAL_SEVERITY_RANK[b.severity] -
        BEHAVIORAL_SEVERITY_RANK[a.severity],
    )
    .slice(0, 5);
  return {
    activeCount: report.signals.length,
    counts: { ...report.counts },
    topSignals: sorted.map((s) => ({
      key: s.key,
      label: BEHAVIORAL_LABELS[s.key] ?? s.key,
      severity: s.severity,
      title: s.title,
      message: s.message,
      ticker: s.ticker ?? null,
    })),
  };
}

function buildDataQualitySection(
  view: PortfolioView,
  coverage?: { withFundamentals: number; withFactorScore: number },
): ReportDataQualitySection {
  const totalPositions = view.summary.positionCount;
  const withPrice = view.valuations.filter(
    (v) => Number.isFinite(v.marketValueBase) && v.marketValueBase > 0,
  ).length;

  const warnings: string[] = [];
  // Sector-coverage warning.
  const missingSector = view.valuations.filter(
    (v) => !v.holding.sector,
  ).length;
  if (missingSector > 0 && totalPositions > 0) {
    warnings.push(
      `${missingSector} van ${totalPositions} posities missen sector-tag — sector-allocatie kan onvolledig zijn.`,
    );
  }
  // Asset-class coverage.
  const missingAssetClass = view.valuations.filter(
    (v) => !v.holding.assetClass,
  ).length;
  if (missingAssetClass > 0 && totalPositions > 0) {
    warnings.push(
      `${missingAssetClass} van ${totalPositions} posities missen asset-class.`,
    );
  }
  // Price freshness — pragmatisch: kijk hoe oud de view-lastUpdated is.
  // (Geen Date.now in builder → tijd-vergelijking laten we aan loader over.)
  // Wel: wanneer geen valuations → expliciete waarschuwing.
  if (totalPositions === 0) {
    warnings.push("Geen posities in portefeuille — rapport is leeg.");
  }
  if (totalPositions > 0 && withPrice < totalPositions) {
    warnings.push(
      `Slechts ${withPrice} van ${totalPositions} posities hebben een geldige koers — sommige analyses zijn beperkt.`,
    );
  }

  return {
    positionsWithPrice: withPrice,
    totalPositions,
    positionsWithFactorScore: coverage?.withFactorScore ?? view.factorScores.size,
    positionsWithFundamentals: coverage?.withFundamentals ?? 0,
    warnings,
  };
}

// ============================================================
//  Action-items aggregator
// ============================================================

/**
 * Bouwt max-5 actiepunten in gewone taal. Selectie-policy:
 *  - 1× critical-health-signal (indien aanwezig)
 *  - 1× top risk-flag (critical of high)
 *  - 1× behavioral-high (panic/FOMO/overconcentration)
 *  - 1× worst-case-stress-scenario verdict
 *  - 1× goal-off-track (indien aanwezig)
 *
 * Wanneer een lens geen kandidaat heeft → die positie wordt overgeslagen.
 *
 * **Toon-conventie**: aandachtspunten, geen orders. "Bekijk", "overweeg",
 * "controleer" — nooit "verkoop X" of "koop Y".
 */
function buildActionItems(input: BuildAdvisorReportInput): ReportActionItem[] {
  const items: ReportActionItem[] = [];

  // 1) Health-signal critical.
  const criticalHealth = input.view.health.signals.find(
    (s) => s.severity === "critical",
  );
  if (criticalHealth) {
    items.push({
      priority: items.length + 1,
      title: criticalHealth.label,
      rationale: criticalHealth.message,
      source: "health",
    });
  }

  // 2) Top risk-flag.
  const topRisk = input.view.risk.flags
    .slice()
    .sort((a, b) => severityWeight(b.severity) - severityWeight(a.severity))[0];
  if (topRisk && (topRisk.severity === "critical" || topRisk.severity === "high")) {
    items.push({
      priority: items.length + 1,
      title: topRisk.label,
      rationale:
        topRisk.message ??
        `Risico-flag met ${topRisk.severity}-niveau — controleer of dit binnen je risicoprofiel valt.`,
      source: "risk",
    });
  }

  // 3) Behavioral high.
  const behaviorTop = input.behavioral?.signals
    .slice()
    .sort(
      (a, b) =>
        BEHAVIORAL_SEVERITY_RANK[b.severity] -
        BEHAVIORAL_SEVERITY_RANK[a.severity],
    )[0];
  if (
    behaviorTop &&
    (behaviorTop.severity === "high" || behaviorTop.severity === "elevated")
  ) {
    items.push({
      priority: items.length + 1,
      title: behaviorTop.title,
      rationale: behaviorTop.message,
      source: "behavioral",
    });
  }

  // 4) Worst-case scenario.
  const worst = input.stress?.worst;
  if (worst && worst.portfolioImpactPct < -0.10) {
    items.push({
      priority: items.length + 1,
      title: `Voorbereid op scenario: ${worst.label}`,
      rationale: `Bij dit scenario daalt de portefeuille met ${formatPct(
        Math.abs(worst.portfolioImpactPct),
      )} — overweeg defensieve buffers of hedge-posities passend bij je horizon.`,
      source: "scenarios",
    });
  }

  // 5) Doelvoortgang off-track.
  if (input.wealth) {
    const offTrackGoal = input.wealth.goals.find(
      (g) =>
        g.feasibilityTier === "AT_RISK" || g.feasibilityTier === "UNLIKELY",
    );
    if (offTrackGoal) {
      items.push({
        priority: items.length + 1,
        title: `Doel "${offTrackGoal.goal.name}" vraagt aandacht`,
        rationale:
          "De projectie ligt onder het pad — bekijk maandelijkse inleg of pas de horizon aan.",
        source: "goals",
      });
    }
  }

  // Cap op 5.
  return items.slice(0, 5);
}

// ============================================================
//  Helpers
// ============================================================

function mapAllocation(slices: ReadonlyArray<AllocationSlice>) {
  return slices.map((s) => ({ label: s.label, weight: s.weight }));
}

function severityWeight(s: string): number {
  switch (s) {
    case "critical":
      return 5;
    case "high":
      return 4;
    case "elevated":
      return 3;
    case "moderate":
      return 2;
    case "low":
      return 1;
    default:
      return 0;
  }
}

function healthSeverityWeight(s: string): number {
  switch (s) {
    case "critical":
      return 3;
    case "warning":
      return 2;
    case "info":
      return 1;
    case "positive":
      return 0;
    default:
      return 0;
  }
}

function formatPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}
