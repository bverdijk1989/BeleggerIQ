/**
 * Digest-builder.
 *
 * Pure functie: krijgt een verzameling events + portfolio-snapshots-of
 * -delta én levert een **5-bullet** samenvatting voor de wekelijkse
 * mail. Geen DB-toegang.
 *
 * De vijf vaste slots:
 *   1. Portefeuille-verandering (waarde/PnL deze week)
 *   2. Belangrijkste risico-update
 *   3. Marktregime-status (verandering of bevestiging)
 *   4. Watchlist-signalen (aantal triggers)
 *   5. Volgende actie (één concrete suggestie)
 *
 * Lege slots krijgen een neutrale "geen wijzigingen"-zin — een digest
 * van 5 bullets blijft consistent voor de lezer.
 */

import type { DigestBullet } from "./templates";
import type { NotificationEvent } from "./events";

export interface PortfolioWeekDelta {
  startValue: number;
  endValue: number;
  baseCurrency: string;
}

export interface DigestInput {
  /** Bv. "week 17, 21–27 april". */
  weekLabel: string;
  events: NotificationEvent[];
  portfolio?: PortfolioWeekDelta | null;
  /** Korte regime-line, bv. "EXPANSION (stabiel)" of "SLOWDOWN (wissel)". */
  regimeStatus?: string | null;
}

export interface BuiltDigest {
  weekLabel: string;
  bullets: DigestBullet[];
  nextAction: string;
}

function fmtMoney(value: number, ccy: string): string {
  return `${value.toLocaleString("nl-NL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })} ${ccy}`;
}

function fmtPct(fraction: number): string {
  const sign = fraction >= 0 ? "+" : "";
  return `${sign}${(fraction * 100).toFixed(1)}%`;
}

export function buildWeeklyDigest(input: DigestInput): BuiltDigest {
  const bullets: DigestBullet[] = [];

  // 1) Portfolio change
  if (input.portfolio) {
    const { startValue, endValue, baseCurrency } = input.portfolio;
    const delta = endValue - startValue;
    const deltaPct = startValue > 0 ? delta / startValue : 0;
    bullets.push({
      label: "Portefeuille",
      detail: `${fmtMoney(endValue, baseCurrency)} (${fmtPct(deltaPct)} deze week, Δ ${fmtMoney(delta, baseCurrency)}).`,
    });
  } else {
    bullets.push({
      label: "Portefeuille",
      detail: "Geen waardering deze week — maak een snapshot via /dashboard.",
    });
  }

  // 2) Risk: pick MEDIUM/HIGH severity recent events
  const riskEvents = input.events.filter(
    (e) =>
      e.type === "NEW_RISK_FLAG" ||
      e.type === "POSITION_CAP_EXCEEDED" ||
      e.type === "FRAGILE_CONCENTRATION",
  );
  if (riskEvents.length > 0) {
    const top = riskEvents
      .slice()
      .sort((a, b) => severityRank(b) - severityRank(a))[0]!;
    bullets.push({
      label: "Risico",
      detail: `${riskEvents.length} risk-event${riskEvents.length === 1 ? "" : "en"} deze week. Top: ${top.title}.`,
    });
  } else {
    bullets.push({
      label: "Risico",
      detail: "Geen nieuwe risk-flags. Allocaties binnen je policy-bandbreedte.",
    });
  }

  // 3) Regime
  bullets.push({
    label: "Marktregime",
    detail:
      input.regimeStatus ??
      "Regime stabiel — geen wisseling deze week.",
  });

  // 4) Watchlist
  const wlEvents = input.events.filter(
    (e) => e.type === "WATCHLIST_PRICE_ALERT",
  );
  if (wlEvents.length > 0) {
    const tickers = Array.from(
      new Set(
        wlEvents
          .map((e) => (e.context.ticker as string | undefined) ?? null)
          .filter((t): t is string => !!t),
      ),
    );
    bullets.push({
      label: "Watchlist",
      detail: `${wlEvents.length} prijssignaal${wlEvents.length === 1 ? "" : "en"} (${tickers.slice(0, 3).join(", ")}${tickers.length > 3 ? ` +${tickers.length - 3}` : ""}).`,
    });
  } else {
    bullets.push({
      label: "Watchlist",
      detail: "Geen tickers binnen je koop-zone deze week.",
    });
  }

  // 5) Next action — kies o.b.v. zwaarste open event
  const next = pickNextAction(input);
  bullets.push({
    label: "Volgende actie",
    detail: next,
  });

  return {
    weekLabel: input.weekLabel,
    bullets,
    nextAction: next,
  };
}

function severityRank(e: NotificationEvent): number {
  if (e.type === "FRAGILE_CONCENTRATION") return 3;
  if (e.severity === "critical") return 2;
  return 1;
}

function pickNextAction(input: DigestInput): string {
  const events = input.events;
  const fragile = events.find((e) => e.type === "FRAGILE_CONCENTRATION");
  if (fragile) {
    const ticker = (fragile.context.ticker as string | undefined) ?? "";
    return `Trim ${ticker || "je grootste positie"} — fragiele concentratie boven 2× cap.`;
  }
  const regime = events.find((e) => e.type === "REGIME_SWITCH");
  if (regime) {
    return "Bekijk de regime-narrative op /dashboard en check of je tilt nog past.";
  }
  const cap = events.find((e) => e.type === "POSITION_CAP_EXCEEDED");
  if (cap) {
    return `Plan een rebalance: ${(cap.context.ticker as string | undefined) ?? "een positie"} staat boven cap.`;
  }
  const wl = events.find((e) => e.type === "WATCHLIST_PRICE_ALERT");
  if (wl) {
    return `Onderzoek ${(wl.context.ticker as string | undefined) ?? "je watchlist"} — prijs raakte je signaal-zone.`;
  }
  return "Niets dringends. Goede week om je beleggersprofiel te reviewen op /profiel.";
}
