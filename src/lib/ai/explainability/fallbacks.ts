/**
 * Deterministische fallback-renderers per domein.
 *
 * Wordt aangeroepen wanneer:
 *  - geen LLM-provider geconfigureerd is, of
 *  - de provider faalde, of
 *  - de guardrails de LLM-output afwezen.
 *
 * Levert dezelfde shape als de AI-versie zodat de UI niets hoeft te
 * weten over het pad. Coachende toon, hedged taal — net als de AI.
 */

import type { BehavioralSignalWithState } from "@/lib/analytics/behavioral";
import type {
  HealthComponent,
  PortfolioHealthScore,
} from "@/lib/analytics/health-score";
import {
  MACRO_REGIME_DESCRIPTIONS,
  MACRO_REGIME_LABELS,
  type MacroRegimeReport,
} from "@/lib/analytics/macro-regime";
import type {
  InvestmentConfidenceScore,
  SignalContribution,
} from "@/lib/analytics/signal-fusion";
import type { WatchlistIntelligenceReport } from "@/lib/watchlist-intelligence";
import type { AllocationPlan } from "@/types/allocation";
import type { PortfolioRiskSummary } from "@/types/risk";

import type { BehavioralExplainContext, ScenarioExplainContext } from "./prompts";
import type { ParsedExplanationDraft } from "./guardrails";
import type { ExplanationAction } from "./types";

// ============================================================
//  Helpers
// ============================================================

function bullet(s: string): string {
  return s.trim();
}

function pct(fraction: number, digits = 1): string {
  if (!Number.isFinite(fraction)) return "—";
  return `${(fraction * 100).toFixed(digits)}%`;
}

// ============================================================
//  1. Portfolio Health Score
// ============================================================

export function fallbackHealth(
  score: PortfolioHealthScore,
): ParsedExplanationDraft {
  const active = score.components.filter((c) => c.status !== "no_data");
  const sorted = [...active].sort((a, b) => b.score - a.score);
  const strong = sorted.filter((c) => c.score >= 60).slice(0, 3);
  const weak = [...sorted].reverse().filter((c) => c.score < 50).slice(0, 3);

  const summary = `Health Score ${Math.round(score.totalScore)}/100 (${score.grade}) — ${score.headline}`;
  const whyItMatters = `De score combineert 10 componenten — concentratie, volatiliteit, kwaliteit, waardering — en helpt bewust te zien waar je portefeuille goed staat en waar mogelijk aandacht nodig is.`;

  const positives = strong.length
    ? strong.map((c) => bullet(`${c.label}: ${c.score}/100 — ${c.rationale}`))
    : [bullet("Geen sterk-scorende component — overweeg te starten met de basis-spreiding.")];

  const risks = weak.length
    ? weak.map((c) =>
        bullet(`${c.label}: ${c.score}/100 — ${c.rationale}`),
      )
    : [bullet("Geen kritieke zwakte gemeten op de hoofdcomponenten.")];

  const possibleActions: ExplanationAction[] = score.topRecommendations
    .slice(0, 3)
    .map((rec) => ({
      title: rec.title,
      rationale: rec.detail,
      link: rec.link,
    }));
  if (possibleActions.length === 0) {
    possibleActions.push({
      title: "Doe een halfjaarlijkse review",
      rationale:
        "Plan een rustig moment waarop je de score per component nakijkt — zelfs zonder dringende actie blijft alignment belangrijk.",
      link: "/portfolio-health",
    });
  }

  const uncertainties: string[] = [];
  if (score.effectiveWeight < 0.8) {
    uncertainties.push(
      bullet(
        `Slechts ${pct(score.effectiveWeight, 0)} van het gewicht heeft data — interpreteer de score met een ruime onzekerheidsmarge.`,
      ),
    );
  }
  const noData = score.components.filter((c) => c.status === "no_data");
  if (noData.length > 0) {
    uncertainties.push(
      bullet(
        `${noData.length} components zonder data: ${noData.map((c) => c.label).join(", ")}.`,
      ),
    );
  }
  if (uncertainties.length === 0) {
    uncertainties.push(
      bullet("Geen materiële data-beperkingen — alle hoofd-components hadden bruikbare input."),
    );
  }

  return { summary, whyItMatters, positives, risks, possibleActions, uncertainties };
}

// ============================================================
//  2. Investment Confidence Score
// ============================================================

export function fallbackConfidence(
  score: InvestmentConfidenceScore,
): ParsedExplanationDraft {
  const active = score.signals.filter(
    (s): s is SignalContribution & { score: number } =>
      s.score !== null && Number.isFinite(s.score),
  );
  const sorted = [...active].sort((a, b) => b.score - a.score);
  const top = sorted.slice(0, 3);
  const bottom = [...sorted].reverse().slice(0, 3).filter((s) => s.score < 50);

  const summary = `${score.ticker}: confidence ${score.totalScore}/100 (${score.tier}) — ${score.headline}`;
  const whyItMatters = `De score weegt 10 signaalbronnen (kwaliteit, waardering, momentum, macro-fit, portfolio-fit). Gebruik 'em als een meting, niet als koop/verkoop-advies.`;

  const positives = top.length
    ? top.map((s) => bullet(`${s.label} ${s.score}/100 — ${s.rationale}`))
    : [bullet("Geen signaal scoort uitgesproken hoog — de score is gemiddeld.")];

  const risks = bottom.length
    ? bottom.map((s) => bullet(`${s.label} ${s.score}/100 — ${s.rationale}`))
    : [bullet("Geen signaal scoort uitgesproken laag.")];

  const possibleActions: ExplanationAction[] = [];
  if (score.tier === "STRONG" || score.tier === "POSITIVE") {
    possibleActions.push({
      title: "Overweeg de positie aan te houden of bij te kopen",
      rationale:
        "Sterke signalen ondersteunen het profiel; let nog steeds op concentratie en horizon.",
      link: "/maandbeslissing",
    });
  } else if (score.tier === "WEAK" || score.tier === "AVOID") {
    possibleActions.push({
      title: "Overweeg of de oorspronkelijke thesis nog klopt",
      rationale:
        "Lage signaal-confidence kan duiden op verzwakking — een review van de thesis is goedkope verzekering.",
      link: "/risico",
    });
  } else {
    possibleActions.push({
      title: "Wachten op duidelijker signalen",
      rationale:
        "Bij een neutrale score zijn extra trades meestal niet nodig — laat de positie zijn werk doen.",
    });
  }
  if (score.warning) {
    possibleActions.push({
      title: "Vul ontbrekende data aan",
      rationale: score.warning,
      link: "/portfolio",
    });
  }

  const uncertainties = score.dataLimitations.length
    ? score.dataLimitations
    : [bullet("Alle signaal-bronnen leverden bruikbare input.")];

  return { summary, whyItMatters, positives, risks, possibleActions, uncertainties };
}

// ============================================================
//  3. Macro Regime
// ============================================================

export function fallbackMacro(
  report: MacroRegimeReport,
): ParsedExplanationDraft {
  const { classification, portfolioImpact } = report;
  const summary = `${MACRO_REGIME_LABELS[classification.regime]} — ${classification.narrative}`;
  const whyItMatters = `Het regime bepaalt welke asset-classes historisch rugwind krijgen en welke tegenwind. ${MACRO_REGIME_DESCRIPTIONS[classification.regime]}`;

  const tailwinds = report.assetMapping.impacts
    .filter((i) => i.direction === "tailwind")
    .sort((a, b) => b.magnitude - a.magnitude)
    .slice(0, 3);
  const headwinds = report.assetMapping.impacts
    .filter((i) => i.direction === "headwind")
    .sort((a, b) => b.magnitude - a.magnitude)
    .slice(0, 3);

  const positives = tailwinds.length
    ? tailwinds.map((i) => bullet(`${i.label}: ${i.rationale}`))
    : [bullet("Geen uitgesproken tailwinds in dit regime — overweeg neutrale tilt.")];

  const risks = headwinds.length
    ? headwinds.map((i) => bullet(`${i.label}: ${i.rationale}`))
    : [bullet("Geen uitgesproken headwinds — markt zoekt richting.")];

  const possibleActions: ExplanationAction[] = [];
  if (portfolioImpact && portfolioImpact.alignmentScore < 60) {
    possibleActions.push({
      title: "Overweeg een lichte tilt richting de regime-baseline",
      rationale: portfolioImpact.summary,
      link: "/macro",
    });
  }
  if (classification.conflictingIndicators.length > 0) {
    possibleActions.push({
      title: "Volg de tegenstrijdige indicators",
      rationale: `Indicators ${classification.conflictingIndicators.join(", ")} wijzen tegen het regime in — check ze elke maand.`,
    });
  }
  if (possibleActions.length === 0) {
    possibleActions.push({
      title: "Houd je strategie aan",
      rationale:
        "Je portefeuille ligt redelijk in lijn met het huidige regime; geen ingrijpende aanpassing vereist.",
    });
  }

  const uncertainties: string[] = [];
  if (classification.confidence < 0.6) {
    uncertainties.push(
      bullet(
        `Confidence ${pct(classification.confidence, 0)} — meerdere indicators wijzen niet eenduidig.`,
      ),
    );
  }
  const missing = classification.indicators.filter((i) => i.score === null);
  if (missing.length > 0) {
    uncertainties.push(
      bullet(
        `${missing.length} indicator(s) zonder data: ${missing.map((m) => m.label).join(", ")}.`,
      ),
    );
  }
  if (uncertainties.length === 0) {
    uncertainties.push(bullet("Indicators zijn coherent — de classificatie is robuust."));
  }

  return { summary, whyItMatters, positives, risks, possibleActions, uncertainties };
}

// ============================================================
//  4. Behavioral Coach
// ============================================================

export function fallbackBehavioral(
  context: BehavioralExplainContext,
): ParsedExplanationDraft {
  const active = context.signals.filter((s) => s.effectiveStatus === "ACTIVE");
  if (active.length === 0) {
    return {
      summary:
        "Geen actieve gedragspatronen — je portefeuille en strategie lopen synchroon.",
      whyItMatters:
        "De Behavioral Coach detecteert 8 patronen (concentratie, panic, FOMO, drift). Kalmte is hier het signaal — je doet het bewust.",
      positives: [
        bullet("Geen overconcentratie of overtrading gemeten."),
        bullet("Geen panic- of FOMO-signaal in recente trades."),
      ],
      risks: [
        bullet(
          "Let op dat signaal-stilte niet automatisch betekent dat alles optimaal is — periodieke review blijft verstandig.",
        ),
      ],
      possibleActions: [
        {
          title: "Overweeg een kwartaal-reflectie",
          rationale:
            "Schrijf één zin op die de afgelopen drie maanden samenvat — patronen worden zichtbaar wanneer je 'em vastlegt.",
        },
      ],
      uncertainties: [
        bullet(
          "Sommige patronen vereisen transactiehistorie — als je weinig handelt, is het signaal-arme beeld te verwachten.",
        ),
      ],
    };
  }

  const top = [...active]
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
    .slice(0, 3);

  const summary = `${active.length} ${active.length === 1 ? "patroon" : "patronen"} actief — vragen om reflectie, niet om paniek.`;
  const whyItMatters =
    "Gedragspatronen kunnen rendement onbedoeld verminderen. De coach stelt vragen i.p.v. veroordelingen — je blijft de eindbeslisser.";

  const positives = active.length < context.signals.length
    ? [
        bullet(
          `${context.signals.length - active.length} signalen staan op snooze of dismissed — je hebt eerdere reflectie al afgehandeld.`,
        ),
      ]
    : [bullet("Bewust handelen begint bij signalen serieus nemen — je kijkt nu mee.")];

  const risks = top.map((s) =>
    bullet(`${s.title}: ${s.message}`),
  );

  const possibleActions: ExplanationAction[] = top.slice(0, 3).map((s) => ({
    title: s.nextStep ?? `Reflecteer op ${s.title.toLowerCase()}`,
    rationale: s.reflectionQuestions[0]?.question ?? s.message,
    link: "/coach",
  }));

  const uncertainties = [
    bullet(
      "Coach-signalen zijn meetbaar maar interpretatie vereist context — je weet zelf het beste of een trade bewust was.",
    ),
  ];

  return { summary, whyItMatters, positives, risks, possibleActions, uncertainties };
}

function severityRank(s: BehavioralSignalWithState["severity"]): number {
  switch (s) {
    case "high":
      return 4;
    case "elevated":
      return 3;
    case "moderate":
      return 2;
    case "low":
      return 1;
  }
}

// ============================================================
//  5. Risk Analysis
// ============================================================

export function fallbackRisk(
  risk: PortfolioRiskSummary,
): ParsedExplanationDraft {
  const summary = `Risico-niveau: ${risk.overallSeverity}. Concentratie HHI ${risk.concentrationHhi.toFixed(2)}.`;
  const whyItMatters =
    "Risico's zijn meetbaar via concentratie, volatiliteit en valuta. Een lage signaal-uitslag betekent niet automatisch lage werkelijkheid — alleen lage signaalruis.";

  const positives: string[] = [];
  if (risk.concentrationHhi < 0.10) {
    positives.push(
      bullet(`Brede positie-spreiding (HHI ${risk.concentrationHhi.toFixed(2)}).`),
    );
  }
  if (typeof risk.portfolioVolatility === "number" && risk.portfolioVolatility < 0.20) {
    positives.push(
      bullet(`Stabiel volatiliteitsprofiel (${pct(risk.portfolioVolatility)}).`),
    );
  }
  if (positives.length === 0) {
    positives.push(bullet("Risico-engine vindt geen uitgesproken sterke punten."));
  }

  const flags = [...risk.flags]
    .sort((a, b) => severityWeight(b.severity) - severityWeight(a.severity))
    .slice(0, 4);
  const risks = flags.length
    ? flags.map((f) => bullet(`${f.label}: ${f.message ?? "geen detail"}.`))
    : [bullet("Geen actieve risk-flags op portfolio-niveau.")];

  const possibleActions: ExplanationAction[] = [];
  if (risk.largestPositionWeight > 0.15) {
    possibleActions.push({
      title: "Overweeg de grootste positie te trimmen",
      rationale: `Single-name exposure ${pct(risk.largestPositionWeight)} — een fout in dit bedrijf werkt disproportioneel door.`,
      link: "/risico",
    });
  }
  if (
    typeof risk.foreignCurrencyExposure === "number" &&
    risk.foreignCurrencyExposure > 0.5
  ) {
    possibleActions.push({
      title: "Bekijk valuta-exposure",
      rationale: `${pct(risk.foreignCurrencyExposure)} in niet-base currency — overweeg of dat bewust is.`,
    });
  }
  if (possibleActions.length === 0) {
    possibleActions.push({
      title: "Houd het risico-niveau in de gaten",
      rationale: "Een halfjaarlijkse review van concentratie + volatiliteit voorkomt dat drift sluipenderwijs optreedt.",
      link: "/risico",
    });
  }

  const uncertainties: string[] = [];
  if (typeof risk.portfolioVolatility !== "number") {
    uncertainties.push(
      bullet("Portfolio-volatiliteit niet beschikbaar — onvoldoende koershistorie."),
    );
  }
  if (typeof risk.maxDrawdown !== "number") {
    uncertainties.push(
      bullet("Max drawdown niet meetbaar — snapshot-historie te kort."),
    );
  }
  if (uncertainties.length === 0) {
    uncertainties.push(bullet("Alle hoofd-meetwaarden zijn beschikbaar."));
  }

  return { summary, whyItMatters, positives, risks, possibleActions, uncertainties };
}

function severityWeight(s: PortfolioRiskSummary["overallSeverity"]): number {
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
  }
}

// ============================================================
//  6. Scenario Analysis
// ============================================================

export function fallbackScenarios(
  context: ScenarioExplainContext,
): ParsedExplanationDraft {
  if (context.scenarios.length === 0) {
    return {
      summary: "Geen scenarios beschikbaar.",
      whyItMatters:
        "Scenario-analyse helpt om je portefeuille te stress-testen tegen plausibele wereldgebeurtenissen.",
      positives: [bullet("Begin met de standaard-scenarios in /risico of /strategy-lab.")],
      risks: [bullet("Zonder scenario-coverage is het lastig defensieve keuzes te onderbouwen.")],
      possibleActions: [
        {
          title: "Run de macro-scenario-engine",
          rationale: "Standaard-set rente-shock + recessie + stagflatie geeft een snelle impact-curve.",
          link: "/risico",
        },
      ],
      uncertainties: [bullet("Geen data — scenarios moeten eerst gedraaid worden.")],
    };
  }

  const sorted = [...context.scenarios].sort(
    (a, b) => a.portfolioImpactPct - b.portfolioImpactPct,
  );
  const worst = sorted[0]!;
  const best = sorted[sorted.length - 1]!;

  const summary = `Worst-case ${worst.name}: ${pct(worst.portfolioImpactPct)} portfolio-impact. Best-case ${best.name}: ${pct(best.portfolioImpactPct)}.`;
  const whyItMatters =
    "Scenario-analyse maakt zichtbaar wat een macro-shock met je portefeuille zou doen — Dalio-laag: het risico expliciet, niet weggemoffeld.";

  const positives = sorted
    .filter((s) => s.portfolioImpactPct >= 0)
    .slice(0, 3)
    .map((s) =>
      bullet(`${s.name}: ${pct(s.portfolioImpactPct)} — ${s.description}.`),
    );
  if (positives.length === 0) {
    positives.push(bullet("Geen scenario levert een duidelijk positieve uitkomst — de portfolio is gevoelig voor de geteste shocks."));
  }

  const risks = sorted
    .filter((s) => s.portfolioImpactPct < 0)
    .slice(0, 3)
    .map((s) =>
      bullet(`${s.name}: ${pct(s.portfolioImpactPct)} — ${s.description}.`),
    );
  if (risks.length === 0) {
    risks.push(bullet("Geen scenario levert een duidelijk negatieve uitkomst — robuust profiel."));
  }

  const possibleActions: ExplanationAction[] = [];
  if (worst.portfolioImpactPct < -0.15) {
    possibleActions.push({
      title: `Overweeg een hedge tegen ${worst.name}`,
      rationale: `Een ${pct(worst.portfolioImpactPct)} dip in dit scenario kan je horizon raken — defensieve allocatie of cash-buffer kan zo'n schok dempen.`,
      link: "/risico",
    });
  }
  if (possibleActions.length === 0) {
    possibleActions.push({
      title: "Houd je strategie aan",
      rationale: "Geen scenario raakt je portefeuille zwaar — geen acute aanpassing nodig.",
    });
  }

  const uncertainties = [
    bullet(
      "Scenario-impact is een statische schatting — sequence-of-returns + duur worden niet meegenomen.",
    ),
  ];

  return { summary, whyItMatters, positives, risks, possibleActions, uncertainties };
}

// ============================================================
//  7. Monthly decision (maandbeslissing) — Module 8
// ============================================================

export function fallbackMonthlyDecision(
  plan: AllocationPlan,
): ParsedExplanationDraft {
  const recs = plan.recommendations ?? [];
  const buys = recs
    .filter((r) => r.action === "buy" || r.action === "add")
    .sort((a, b) => (b.suggestedAmount ?? 0) - (a.suggestedAmount ?? 0));
  const trims = recs.filter(
    (r) => r.action === "trim" || r.action === "sell",
  );

  const totalBudget = plan.budget ?? plan.monthlyContribution;
  const deployed = plan.deployedAmount ?? buys.reduce(
    (sum, r) => sum + (r.suggestedAmount ?? 0),
    0,
  );
  const reserved = plan.cashReserved ?? Math.max(0, totalBudget - deployed);

  const summary = plan.summary
    ? plan.summary
    : recs.length === 0
      ? `Geen koopactie deze maand — overweeg het budget aan te houden of door te schuiven.`
      : `Maandplan: ${recs.length} aanbeveling${recs.length === 1 ? "" : "en"}, ingezet ${Math.round(deployed)} ${plan.baseCurrency}${reserved > 0 ? `, ${Math.round(reserved)} bewust gereserveerd` : ""}.`;

  const whyItMatters = `Dit plan zet je periodieke inleg in volgens de huidige policy + regime-tilt. Een doordachte allocatie elke maand bouwt — Buffett-laag — een lange-termijn-fundament zonder timing-stress.`;

  const positives: string[] = [];
  if (buys.length > 0) {
    positives.push(
      ...buys.slice(0, 3).map((r) =>
        bullet(
          `${r.action === "buy" ? "Nieuw" : "Bijkopen"}: ${r.ticker}${r.name ? ` (${r.name})` : ""} — ~${Math.round(r.suggestedAmount ?? 0)} ${plan.baseCurrency}${r.rationale[0] ? ` · ${r.rationale[0]}` : ""}`,
        ),
      ),
    );
  }
  if (plan.simulation) {
    positives.push(
      bullet(
        `Projectie na uitvoering: ${plan.simulation.projectedPositionCount} posities, grootste positie ${pct(plan.simulation.projectedLargestPositionWeight)}.`,
      ),
    );
  }
  if (positives.length === 0) {
    positives.push(bullet("Geen specifieke aanbevelingen — beleid is om door te DCA-en in de bestaande core."));
  }

  const risks: string[] = [];
  if (trims.length > 0) {
    risks.push(
      ...trims.slice(0, 2).map((r) =>
        bullet(
          `Trim/sell: ${r.ticker} (${pct(r.currentWeight)} → ${pct(r.targetWeight)})${r.rationale[0] ? ` · ${r.rationale[0]}` : ""}.`,
        ),
      ),
    );
  }
  if (reserved > 0 && totalBudget > 0 && reserved / totalBudget > 0.30) {
    risks.push(
      bullet(
        `Veel cash gereserveerd (~${pct(reserved / totalBudget, 0)} van budget) — let op cash-drag.`,
      ),
    );
  }
  if (plan.warnings && plan.warnings.length > 0) {
    risks.push(...plan.warnings.slice(0, 3).map((w) => bullet(w)));
  }
  if (risks.length === 0) {
    risks.push(bullet("Geen materiële risico's gesignaleerd door de allocatie-engine voor deze maand."));
  }

  const possibleActions: ExplanationAction[] = [];
  if (buys.length > 0) {
    possibleActions.push({
      title: "Bekijk de maandbeslissing-pagina",
      rationale: "Per recommendation zie je de volledige redenering + alternatieven.",
      link: "/maandbeslissing",
    });
  }
  if (plan.coreEtfUsed) {
    possibleActions.push({
      title: "Overweeg of de core-ETF nog past",
      rationale:
        "De engine gebruikte de core-ETF fallback voor spreiding — controleer of je 'em bewust als breedmix wilt aanhouden.",
      link: "/portfolio",
    });
  }
  if (possibleActions.length === 0) {
    possibleActions.push({
      title: "Houd de maandbijdrage als cash-buffer",
      rationale: "Geen sterke kandidaten op tafel — geld vasthouden tot er een betere setup komt is een geldige actie.",
    });
  }

  const uncertainties: string[] = [];
  if (!plan.simulation) {
    uncertainties.push(
      bullet("Post-buy projectie ontbreekt — interpreteer de impact-cijfers met marge."),
    );
  }
  if (!plan.regime) {
    uncertainties.push(
      bullet("Regime-tilt is niet meegenomen — plan is policy-only."),
    );
  }
  if (uncertainties.length === 0) {
    uncertainties.push(
      bullet("Allocatie-engine kreeg policy + regime + valuations als input — coverage is volledig."),
    );
  }

  return { summary, whyItMatters, positives, risks, possibleActions, uncertainties };
}

// ============================================================
//  8. Watchlist signals — Module 8
// ============================================================

export function fallbackWatchlist(
  report: WatchlistIntelligenceReport,
): ParsedExplanationDraft {
  const active = report.signals.filter((s) => s.available);
  const positivesSignals = [...active]
    .filter((s) => s.direction === "positive")
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 3);
  const negativesSignals = [...active]
    .filter((s) => s.direction === "negative")
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 3);
  const missing = report.signals.filter((s) => !s.available);

  const summary = `${report.ticker}: ${report.headline} (tier ${report.tier}).`;
  const whyItMatters = `Watchlist-signalen zijn aandachtspunten, geen koop-triggers. ${report.whyInteresting}`;

  const positives = positivesSignals.length
    ? positivesSignals.map((s) =>
        bullet(`${s.label}: ${s.rationale}`),
      )
    : [bullet("Geen sterk positieve signalen op dit moment — wachten kan ook informatief zijn.")];

  const risks = negativesSignals.length
    ? negativesSignals.map((s) =>
        bullet(`${s.label}: ${s.rationale}`),
      )
    : [bullet("Geen actieve negatieve signalen.")];

  const possibleActions: ExplanationAction[] = [];
  if (report.tier === "STRONG_OPPORTUNITY" || report.tier === "POSITIVE") {
    possibleActions.push({
      title: "Bekijk de full breakdown",
      rationale: "Per signaal zie je de meetwaarde en rationale — bevestig of het bij je strategie past.",
      link: `/watchlist`,
    });
  }
  if (report.alternatives.length > 0) {
    const alt = report.alternatives[0]!;
    possibleActions.push({
      title: `Vergelijk met ${alt.ticker}`,
      rationale: `Lijkt op deze ticker (similarity ${pct(alt.similarity, 0)}, score ${alt.compositeScore}/100) — ${alt.rationale}`,
      link: `/score/${alt.ticker}`,
    });
  }
  if (possibleActions.length === 0) {
    possibleActions.push({
      title: "Houd op de watchlist staan",
      rationale: "Niet-handelen-is-ook-een-keuze — wacht op een sterker setup of duidelijker signaal.",
      link: "/watchlist",
    });
  }

  const uncertainties: string[] = [];
  if (missing.length > 0) {
    uncertainties.push(
      bullet(
        `${missing.length} van de 7 signalen ontbreken: ${missing.map((m) => m.label).join(", ")}.`,
      ),
    );
  }
  if (report.alternatives.length === 0) {
    uncertainties.push(
      bullet("Geen vergelijkbare alternatieven gevonden — beoordeling op merits van deze ticker alleen."),
    );
  }
  if (uncertainties.length === 0) {
    uncertainties.push(bullet("Alle 7 signaalbronnen leverden bruikbare data."));
  }

  return { summary, whyItMatters, positives, risks, possibleActions, uncertainties };
}
