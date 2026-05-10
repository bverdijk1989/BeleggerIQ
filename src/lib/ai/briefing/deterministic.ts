/**
 * Deterministische fallback-renderer voor de Daily Briefing.
 *
 * Wordt aangeroepen wanneer:
 *  - geen LLM-provider geconfigureerd is, of
 *  - de provider faalde, of
 *  - guardrails de LLM-output afwezen.
 *
 * UX-doel: zelfde shape als de AI-versie, zelfde 7 secties, dezelfde
 * hedged taal. De gebruiker ziet niet duidelijk verschil in lay-out;
 * alleen `mode="fallback"` en een subtiele indicator in de UI.
 *
 * Per sectie schrijven we 1–3 zinnen — strikt template-based, geen
 * randomization, geen onzin. Wanneer een datapunt ontbreekt schrijven we
 * "Geen data beschikbaar — …" + dataAvailable=false.
 */

import type {
  BriefingContext,
  BriefingPositionSnapshot,
  BriefingSection,
} from "./types";
import { BRIEFING_SECTION_LABELS } from "./types";

export interface DeterministicBriefingResult {
  headline: string;
  sections: BriefingSection[];
  focusAction: string;
}

export function renderDeterministicBriefing(
  ctx: BriefingContext,
): DeterministicBriefingResult {
  return {
    headline: buildHeadline(ctx),
    sections: [
      portfolioMovement(ctx),
      winnersLosers(ctx),
      risks(ctx),
      macro(ctx),
      earningsNews(ctx),
      concentrationVolatility(ctx),
      focusAction(ctx),
    ],
    focusAction: focusAction(ctx).body,
  };
}

// ============================================================
//  Headline
// ============================================================

function buildHeadline(ctx: BriefingContext): string {
  const { totals, movement, macro: m } = ctx;
  const value = formatCurrency(totals.totalValue, ctx.baseCurrency);
  const dayMove =
    movement.dayChangePct !== null
      ? ` ${formatSignedPct(movement.dayChangePct)} sinds vorige snapshot`
      : "";
  const stance = m ? `, regime ${m.stance.toLowerCase()}` : "";
  return `Portefeuille ${value}${dayMove}${stance}.`;
}

// ============================================================
//  1. Portfolio movement
// ============================================================

function portfolioMovement(ctx: BriefingContext): BriefingSection {
  const m = ctx.movement;
  if (
    m.dayChangePct === null &&
    m.weekChangePct === null &&
    m.monthChangePct === null &&
    m.sincePurchasePct === null
  ) {
    return section("portfolio_movement", false,
      "Nog onvoldoende historische snapshots om beweging te kwantificeren. Overweeg dagelijkse snapshots in te schakelen voor trendvergelijking.",
    );
  }
  const parts: string[] = [];
  if (m.dayChangePct !== null) {
    parts.push(`Dag: ${formatSignedPct(m.dayChangePct)}`);
  }
  if (m.weekChangePct !== null) {
    parts.push(`week: ${formatSignedPct(m.weekChangePct)}`);
  }
  if (m.monthChangePct !== null) {
    parts.push(`maand: ${formatSignedPct(m.monthChangePct)}`);
  }
  const movementLine =
    parts.length > 0
      ? `Beweging — ${parts.join(", ")}.`
      : "Bewegingsdata beperkt beschikbaar.";
  const sinceLine =
    m.sincePurchasePct !== null
      ? ` Sinds aankoop staat de portefeuille op ${formatSignedPct(m.sincePurchasePct)}; let op dat dit een lange-termijnbeeld is, geen daghandelsignaal.`
      : "";
  return section("portfolio_movement", true, movementLine + sinceLine);
}

// ============================================================
//  2. Winners / losers
// ============================================================

function winnersLosers(ctx: BriefingContext): BriefingSection {
  const { winners, losers } = ctx.winnersLosers;
  if (winners.length === 0 && losers.length === 0) {
    return section("winners_losers", false,
      "Geen posities met betrouwbare kostprijs-data om winnaars en verliezers te ranken.",
    );
  }
  const winnersStr = winners
    .map((p) => formatPositionLine(p))
    .join("; ");
  const losersStr = losers.map((p) => formatPositionLine(p)).join("; ");
  const winnerSentence =
    winners.length > 0
      ? `Sterkste posities sinds aankoop: ${winnersStr}.`
      : "Geen positie boven kostprijs.";
  const loserSentence =
    losers.length > 0
      ? ` Zwakste posities: ${losersStr} — overweeg of de oorspronkelijke thesis nog klopt.`
      : "";
  return section(
    "winners_losers",
    true,
    `${winnerSentence}${loserSentence}`,
  );
}

function formatPositionLine(p: BriefingPositionSnapshot): string {
  return `${p.ticker} ${formatSignedPct(p.pnlPct)}`;
}

// ============================================================
//  3. Risks
// ============================================================

function risks(ctx: BriefingContext): BriefingSection {
  if (ctx.risks.length === 0) {
    return section("risks", true,
      "Risk-engine signaleert geen acute risico's. Let op dat lage signaalruis niet automatisch lage werkelijkheidsrisico betekent — periodieke check blijft verstandig.",
    );
  }
  const top = ctx.risks[0]!;
  const main = `Risk-engine vlagt: ${top.title} (${top.severity}). ${top.impact} Mogelijke vervolgstap: ${top.recommendedAction.toLowerCase()}.`;
  const others =
    ctx.risks.length > 1
      ? ` Andere flags: ${ctx.risks.slice(1).map((r) => r.title).join("; ")}.`
      : "";
  return section("risks", true, main + others);
}

// ============================================================
//  4. Macro
// ============================================================

function macro(ctx: BriefingContext): BriefingSection {
  if (!ctx.macro) {
    return section("macro", false,
      "Marktregime-fetch leverde geen actuele snapshot — macro-laag is vandaag niet betrouwbaar te interpreteren.",
    );
  }
  const m = ctx.macro;
  const score = `${Math.round(m.score)}/100`;
  const stance = m.stance.toLowerCase();
  const conf = `${Math.round(m.confidence * 100)}% confidence`;
  const narrative = m.narrative.length > 0 ? ` ${m.narrative}` : "";
  return section("macro", true,
    `Regime staat op ${stance} (${score}, ${conf}).${narrative} Overweeg dat een ${stance}-regime de pasvorm van defensieve respectievelijk cyclische posities beïnvloedt.`,
  );
}

// ============================================================
//  5. Earnings / news
// ============================================================

function earningsNews(ctx: BriefingContext): BriefingSection {
  if (!ctx.earningsNews.available || ctx.earningsNews.items.length === 0) {
    return section("earnings_news", false,
      "Earnings- en nieuwsfeed niet aangesloten — deze sectie blijft tot een data-bron is geïntegreerd buiten de scope van de huidige briefing.",
    );
  }
  const items = ctx.earningsNews.items
    .map((i) => `${i.ticker} (${i.date}): ${i.headline}`)
    .join("; ");
  return section("earnings_news", true, items);
}

// ============================================================
//  6. Concentration / volatility
// ============================================================

function concentrationVolatility(ctx: BriefingContext): BriefingSection {
  const c = ctx.concentration;
  const lines: string[] = [];

  if (c.largestPositionTicker !== null && c.largestPositionWeight > 0.15) {
    lines.push(
      `${c.largestPositionTicker} weegt ${formatPct(c.largestPositionWeight)} — let op dat een single-name fout daar disproportioneel doorwerkt.`,
    );
  }
  if (
    c.largestSectorLabel !== null &&
    c.largestSectorWeight !== null &&
    c.largestSectorWeight > 0.30
  ) {
    lines.push(
      `Sector ${c.largestSectorLabel} ${formatPct(c.largestSectorWeight)} — mogelijk verhoogde correlatie binnen de portefeuille.`,
    );
  }
  if (c.portfolioVolatility !== null && c.portfolioVolatility > 0.25) {
    lines.push(
      `Portefeuille-volatiliteit ${formatPct(c.portfolioVolatility)} jaarlijks; overweeg een lage-vol-component bij toenemende drawdown-tolerantie.`,
    );
  }
  if (c.maxDrawdown !== null && c.maxDrawdown > 0.20) {
    lines.push(
      `Max drawdown in historie ${formatPct(c.maxDrawdown)} — past dat bij je risico-tolerantie?`,
    );
  }

  if (lines.length === 0) {
    return section("concentration_volatility", true,
      "Concentratie en volatiliteit blijven binnen normale ranges. Periodieke herijking aan je policy blijft verstandig.",
    );
  }
  return section("concentration_volatility", true, lines.join(" "));
}

// ============================================================
//  7. Focus action
// ============================================================

function focusAction(ctx: BriefingContext): BriefingSection {
  if (!ctx.focusAction) {
    return section("focus_action", true,
      "Geen actiegerichte trigger uit de engines — overweeg vandaag tijd te besteden aan een methodologie-review of het bijwerken van ontbrekende data-velden.",
    );
  }
  const a = ctx.focusAction;
  const conf = `${Math.round(a.confidence * 100)}%`;
  return section("focus_action", true,
    `Aandachtspunt vandaag: ${a.title}. ${a.description} Engine-confidence ${conf} (bron: ${a.sourceEngine}). Overweeg de actie tegen je eigen tijdslijn af te wegen, niet als spoed.`,
  );
}

// ============================================================
//  Helpers
// ============================================================

function section(
  key: BriefingSection["key"],
  dataAvailable: boolean,
  body: string,
): BriefingSection {
  return {
    key,
    label: BRIEFING_SECTION_LABELS[key],
    body,
    dataAvailable,
  };
}

function formatPct(fraction: number): string {
  if (!Number.isFinite(fraction)) return "—";
  return `${(fraction * 100).toFixed(1)}%`;
}

function formatSignedPct(fraction: number): string {
  if (!Number.isFinite(fraction)) return "—";
  const sign = fraction >= 0 ? "+" : "";
  return `${sign}${(fraction * 100).toFixed(1)}%`;
}

function formatCurrency(amount: number, currency: string): string {
  if (!Number.isFinite(amount)) return "—";
  try {
    return new Intl.NumberFormat("nl-NL", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount.toFixed(0)} ${currency}`;
  }
}
