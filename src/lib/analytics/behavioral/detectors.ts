/**
 * 8 behavioral detectors — pure functies.
 *
 * **Conventie per detector**:
 *  - Input: `BehavioralDetectorInput` (alles vooraf geaggregeerd).
 *  - Output: `DetectorResult` met óf 0..N signals óf een skip-reason.
 *  - Geen toegang tot wall-clock; gebruik `input.asOf`.
 *
 * **Toon**: signaal-`title` en `message` zijn coachend, niet
 * veroordelend. We schrijven "wijkt af van je strategie", niet "je hebt
 * fout gehandeld". Reflectievragen prikkelen tot een bewuste keuze.
 */

import type {
  BehavioralDetectorInput,
  BehavioralPosition,
} from "./detector-types";
import type {
  BehavioralReflectionQuestion,
  BehavioralSeverity,
  BehavioralSignal,
  BehavioralSignalKey,
} from "./types";

// ============================================================
//  Drempels (constants — wijziging vereist PR met rationale)
// ============================================================

const CONCENTRATION_POSITION_TIERS: Array<{ min: number; severity: BehavioralSeverity }> = [
  { min: 0.30, severity: "high" },
  { min: 0.20, severity: "elevated" },
  { min: 0.15, severity: "moderate" },
  { min: 0.10, severity: "low" },
];

const CONCENTRATION_SECTOR_TIERS: Array<{ min: number; severity: BehavioralSeverity }> = [
  { min: 0.55, severity: "high" },
  { min: 0.45, severity: "elevated" },
  { min: 0.35, severity: "moderate" },
];

const OVERTRADING_30D_TIERS: Array<{ min: number; severity: BehavioralSeverity }> = [
  { min: 20, severity: "high" },
  { min: 12, severity: "elevated" },
  { min: 8, severity: "moderate" },
];

const PANIC_DROP_THRESHOLD = -0.08; // -8% in 7 dagen vóór SELL = panic-flag
const PANIC_DROP_HIGH = -0.15;
const FOMO_RISE_THRESHOLD = 0.15; // +15% in 30 dagen vóór BUY = FOMO-flag
const FOMO_RISE_HIGH = 0.30;
const PERFORMANCE_CHASING_PNL_PCT = 0.40; // BUY in een ticker die >40% PnL had

const MIN_POSITIONS_DEFAULT = 8;

// ============================================================
//  Helpers
// ============================================================

interface DetectorResult {
  signals: BehavioralSignal[];
  /** Wanneer de detector niet kon draaien (geen data). */
  skipReason?: string;
}

function pickSeverity<T extends { min: number; severity: BehavioralSeverity }>(
  value: number,
  tiers: ReadonlyArray<T>,
): BehavioralSeverity | null {
  for (const tier of tiers) {
    if (value >= tier.min) return tier.severity;
  }
  return null;
}

function makeSignal(
  partial: Omit<BehavioralSignal, "detectedAt">,
  asOf: string,
): BehavioralSignal {
  return { ...partial, detectedAt: asOf };
}

function pct(fraction: number): string {
  if (!Number.isFinite(fraction)) return "—";
  return `${(fraction * 100).toFixed(1)}%`;
}

function signedPct(fraction: number): string {
  if (!Number.isFinite(fraction)) return "—";
  const sign = fraction >= 0 ? "+" : "";
  return `${sign}${(fraction * 100).toFixed(1)}%`;
}

// ============================================================
//  1. Overconcentratie — single position OF sector
// ============================================================

const OVERCONCENTRATION_REFLECTION: BehavioralReflectionQuestion[] = [
  {
    key: "concentration_drop_30",
    question: "Wat zou je doen als deze positie morgen 30% daalt?",
    hint: "Een positie waarvan een 30%-daling je nachtrust kost is wellicht te groot voor je risicotolerantie.",
  },
  {
    key: "concentration_alternative",
    question: "Past de overweging bij een bewuste convictie, of is het 'gegroeid' zonder dat je trimde?",
  },
];

const SECTOR_REFLECTION: BehavioralReflectionQuestion[] = [
  {
    key: "sector_correlation",
    question: "Welk gemeenschappelijk risico delen deze sector-posities — rente, regelgeving, supply chain?",
    hint: "Een sectorshock raakt al je posities tegelijk; een waardering buiten de sector kan dempen.",
  },
];

export function detectOverconcentration(
  input: BehavioralDetectorInput,
): DetectorResult {
  const signals: BehavioralSignal[] = [];

  if (input.positions.length === 0) {
    return { signals: [], skipReason: "no-positions" };
  }

  const userMaxWeight = input.profile?.maxPositionWeight ?? null;

  // Per-position overconcentratie
  for (const pos of input.positions) {
    if (pos.weight < 0.10) continue;
    const tierSeverity = pickSeverity(pos.weight, CONCENTRATION_POSITION_TIERS);
    if (!tierSeverity) continue;

    // User-policy maxPositionWeight verhoogt de severity met 1 stap
    // wanneer de positie er overheen schiet.
    let severity = tierSeverity;
    if (userMaxWeight && pos.weight > userMaxWeight && severity !== "high") {
      severity = bumpSeverity(severity);
    }

    signals.push(
      makeSignal(
        {
          id: `OVERCONCENTRATION:${pos.ticker}`,
          key: "OVERCONCENTRATION",
          severity,
          title: `${pos.ticker} weegt ${pct(pos.weight)} — flinke single-name exposure`,
          message: `${pos.name} staat op ${pct(pos.weight)} van je portefeuille. Een grote positie kan goed zijn als bewuste convictie, maar maakt je portefeuille kwetsbaar voor één-bedrijf-nieuws.`,
          metric: pos.weight,
          threshold: userMaxWeight ?? 0.15,
          reflectionQuestions: OVERCONCENTRATION_REFLECTION,
          ticker: pos.ticker,
          nextStep: `Overweeg of je deze weging bewust wilt vasthouden of stapsgewijs wilt afbouwen.`,
          sourceEngines: ["portfolio-view"],
        },
        input.asOf,
      ),
    );
  }

  // Sector-overconcentratie
  for (const sector of input.sectorExposure) {
    const severity = pickSeverity(sector.weight, CONCENTRATION_SECTOR_TIERS);
    if (!severity) continue;
    signals.push(
      makeSignal(
        {
          id: `OVERCONCENTRATION:SECTOR:${sector.label}`,
          key: "OVERCONCENTRATION",
          severity,
          title: `Sector ${sector.label} weegt ${pct(sector.weight)}`,
          message: `Eén sector domineert je portefeuille. Een sectorshock — rente, regulering, vraaguitval — raakt dan veel posities tegelijk.`,
          metric: sector.weight,
          threshold: 0.35,
          reflectionQuestions: SECTOR_REFLECTION,
          nextStep:
            "Overweeg een complementaire sector als counter-tilt om correlatie-risico te dempen.",
          sourceEngines: ["risk-engine"],
        },
        input.asOf,
      ),
    );
  }

  return { signals };
}

function bumpSeverity(s: BehavioralSeverity): BehavioralSeverity {
  if (s === "low") return "moderate";
  if (s === "moderate") return "elevated";
  return "high";
}

// ============================================================
//  2. Overtrading — # transacties / 30 dagen
// ============================================================

const OVERTRADING_REFLECTION: BehavioralReflectionQuestion[] = [
  {
    key: "overtrading_intent",
    question:
      "Welke van je laatste 5 trades had je achteraf liever overgeslagen?",
    hint: "Hoge handelsfrequentie verlaagt netto rendement door spread + belasting; let op of het bij je strategie past.",
  },
  {
    key: "overtrading_trigger",
    question: "Welke trigger ging vooraf aan deze trades — nieuws, koers, vrienden, FOMO?",
  },
];

export function detectOvertrading(
  input: BehavioralDetectorInput,
): DetectorResult {
  if (input.recentTransactions.length === 0) {
    return { signals: [], skipReason: "no-transactions" };
  }
  const cutoff = new Date(input.asOf);
  cutoff.setUTCDate(cutoff.getUTCDate() - 30);
  const last30d = input.recentTransactions.filter(
    (t) => t.executedAt >= cutoff && (t.type === "BUY" || t.type === "SELL"),
  );
  const count = last30d.length;
  const severity = pickSeverity(count, OVERTRADING_30D_TIERS);
  if (!severity) return { signals: [] };

  return {
    signals: [
      makeSignal(
        {
          id: "OVERTRADING:GLOBAL",
          key: "OVERTRADING",
          severity,
          title: `${count} koop-/verkoop-trades in 30 dagen`,
          message: `Een hoge handelsfrequentie kost rendement via spread, fees en belasting. Veel pro-beleggers schalen handmatig terug naar 1–2 trades per maand voor een lange-termijnstrategie.`,
          metric: count,
          threshold: 8,
          reflectionQuestions: OVERTRADING_REFLECTION,
          nextStep:
            "Overweeg een wachttijd-regel: schrijf je idee op en plaats de order pas 24 uur later.",
          sourceEngines: ["transactions"],
        },
        input.asOf,
      ),
    ],
  };
}

// ============================================================
//  3. Panic selling — SELL na recente daling
// ============================================================

const PANIC_REFLECTION: BehavioralReflectionQuestion[] = [
  {
    key: "panic_thesis_change",
    question:
      "Was er nieuw bedrijfs-/macro-nieuws dat je thesis veranderde, of reageerde je op de prijs?",
    hint: "Buffett: 'Be fearful when others are greedy and greedy when others are fearful.'",
  },
  {
    key: "panic_horizon",
    question:
      "Past deze verkoop bij je horizon van meerdere jaren, of was het een kortetermijn-reactie?",
  },
];

export function detectPanicSelling(
  input: BehavioralDetectorInput,
): DetectorResult {
  const sells = input.recentTransactions.filter(
    (t) => t.type === "SELL" && t.priceBefore !== null && t.price !== null,
  );
  if (sells.length === 0) {
    return { signals: [], skipReason: "no-sells-with-price-history" };
  }
  const signals: BehavioralSignal[] = [];

  for (const sell of sells) {
    if (sell.priceBefore === null || sell.price === null) continue;
    const change = (sell.price - sell.priceBefore) / sell.priceBefore;
    if (change > PANIC_DROP_THRESHOLD) continue; // alleen als gedaald

    const severity: BehavioralSeverity =
      change <= PANIC_DROP_HIGH ? "elevated" : "moderate";
    const dateStr = sell.executedAt.toISOString().slice(0, 10);
    signals.push(
      makeSignal(
        {
          id: `PANIC_SELLING:${sell.ticker}:${dateStr}`,
          key: "PANIC_SELLING",
          severity,
          title: `Verkoop ${sell.ticker} na recente daling van ${signedPct(change)}`,
          message: `${sell.ticker} stond ${signedPct(change)} in de week vóór je verkoop. Snel verkopen na een daling vergrendelt het verlies; soms is het terecht (thesis veranderd), soms is het emotioneel.`,
          metric: change,
          threshold: PANIC_DROP_THRESHOLD,
          reflectionQuestions: PANIC_REFLECTION,
          ticker: sell.ticker,
          nextStep:
            "Schrijf bij elke verkoop één zin op die je beslissing motiveert — dat helpt patronen te zien.",
          sourceEngines: ["transactions", "history"],
        },
        input.asOf,
      ),
    );
  }
  return { signals };
}

// ============================================================
//  4. FOMO buying — BUY na sterke stijging
// ============================================================

const FOMO_REFLECTION: BehavioralReflectionQuestion[] = [
  {
    key: "fomo_timing",
    question:
      "Past deze positie nog bij je 5-jarig plan, of koop je achter het peloton aan?",
    hint: "Lynch: 'Most stocks lose money in the year after their best year.' De winnaar van vandaag is vaak de teleursteller van morgen.",
  },
  {
    key: "fomo_alternative",
    question: "Wat had je gedaan als deze positie 30% LAGER had gestaan — nog steeds gekocht?",
  },
];

export function detectFomoBuying(
  input: BehavioralDetectorInput,
): DetectorResult {
  const buys = input.recentTransactions.filter(
    (t) => t.type === "BUY" && t.priceBefore30d !== null && t.price !== null,
  );
  if (buys.length === 0) {
    return { signals: [], skipReason: "no-buys-with-price-history" };
  }
  const signals: BehavioralSignal[] = [];
  for (const buy of buys) {
    if (buy.priceBefore30d === null || buy.price === null) continue;
    const change = (buy.price - buy.priceBefore30d) / buy.priceBefore30d;
    if (change < FOMO_RISE_THRESHOLD) continue;

    const severity: BehavioralSeverity =
      change >= FOMO_RISE_HIGH ? "elevated" : "moderate";
    const dateStr = buy.executedAt.toISOString().slice(0, 10);
    signals.push(
      makeSignal(
        {
          id: `FOMO_BUYING:${buy.ticker}:${dateStr}`,
          key: "FOMO_BUYING",
          severity,
          title: `${buy.ticker} aangekocht na ${signedPct(change)} in 30 dagen`,
          message: `Aankopen na een sterke stijging is risicovol — je betaalt premium en verkleint je margin of safety. Soms terecht (thesis is sterker geworden), soms FOMO.`,
          metric: change,
          threshold: FOMO_RISE_THRESHOLD,
          reflectionQuestions: FOMO_REFLECTION,
          ticker: buy.ticker,
          nextStep:
            "Wachten op een 5–10% retracement is een goedkope manier om FOMO te dempen.",
          sourceEngines: ["transactions", "history"],
        },
        input.asOf,
      ),
    );
  }
  return { signals };
}

// ============================================================
//  5. Strategy drift — afwijking van langetermijndoel
// ============================================================

const DRIFT_REFLECTION: BehavioralReflectionQuestion[] = [
  {
    key: "drift_intentional",
    question:
      "Wijkt je portefeuille bewust af, of is het 'er zo gegroeid'?",
    hint: "Drift is normaal door koersbeweging; bewust herijken houdt je portefeuille bij je profiel.",
  },
  {
    key: "drift_anchor",
    question:
      "Wat was je oorspronkelijke aandelen/obligatie/cash-mix toen je begon — herken je dat nog?",
  },
];

const OBJECTIVE_TARGET_EQUITY: Record<string, number> = {
  GROWTH: 0.85,
  FIRE: 0.85,
  BALANCED: 0.65,
  RETIREMENT: 0.55,
  INCOME: 0.45,
  CAPITAL_PRESERVATION: 0.35,
  CUSTOM: 0.65,
};

export function detectStrategyDrift(
  input: BehavioralDetectorInput,
): DetectorResult {
  if (!input.profile) return { signals: [], skipReason: "no-profile" };
  if (input.totalValue <= 0) return { signals: [], skipReason: "no-value" };

  // Heuristiek: vergelijk equity-share (1 - cashShare) met de target-mix
  // voor het objective. Een 20-punt afwijking is materieel.
  const cashShare = input.cashBalance / input.totalValue;
  const equityShare = Math.max(0, 1 - cashShare);
  const target = OBJECTIVE_TARGET_EQUITY[input.profile.objective] ?? 0.65;
  const drift = equityShare - target;
  const driftAbs = Math.abs(drift);

  if (driftAbs < 0.20) {
    return { signals: [] };
  }
  const severity: BehavioralSeverity = driftAbs >= 0.30 ? "elevated" : "moderate";
  const direction =
    drift > 0
      ? `agressiever dan je profiel ${input.profile.objective.toLowerCase()} aangeeft`
      : `defensiever dan je profiel ${input.profile.objective.toLowerCase()} aangeeft`;

  return {
    signals: [
      makeSignal(
        {
          id: "STRATEGY_DRIFT:GLOBAL",
          key: "STRATEGY_DRIFT",
          severity,
          title: `Portefeuille wijkt af van je strategie`,
          message: `Je equity-aandeel is ${pct(equityShare)} terwijl je ${input.profile.objective.toLowerCase()}-profiel rond ${pct(target)} verwacht. Je staat nu ${direction}. Wijkt dat bewust af, of vraagt het om een herijking?`,
          metric: drift,
          threshold: 0.20,
          reflectionQuestions: DRIFT_REFLECTION,
          nextStep:
            "Plan een halfjaarlijkse rebalance-review zodat drift niet sluipenderwijs je risicoprofiel verandert.",
          sourceEngines: ["portfolio-view", "profile"],
        },
        input.asOf,
      ),
    ],
  };
}

// ============================================================
//  6. Onder-diversificatie — te weinig posities
// ============================================================

const UNDER_DIVERS_REFLECTION: BehavioralReflectionQuestion[] = [
  {
    key: "diversification_universe",
    question:
      "Wat zou je doen als één van deze posities morgen failliet gaat — voel je dat verlies opvangbaar?",
    hint: "Markowitz: marginale risicoreductie is het grootst tussen 5 en 15 posities; daarboven werken kostenvoordelen langzamer door.",
  },
];

export function detectUnderDiversification(
  input: BehavioralDetectorInput,
): DetectorResult {
  if (input.positionCount === 0) {
    return { signals: [], skipReason: "no-positions" };
  }
  if (input.positionCount >= MIN_POSITIONS_DEFAULT) {
    return { signals: [] };
  }
  const severity: BehavioralSeverity =
    input.positionCount <= 2 ? "elevated" : "moderate";
  return {
    signals: [
      makeSignal(
        {
          id: "UNDER_DIVERSIFICATION:GLOBAL",
          key: "UNDER_DIVERSIFICATION",
          severity,
          title: `Slechts ${input.positionCount} posities`,
          message: `Een portefeuille met weinig posities profiteert minder van diversificatie. Markowitz' curve laat zien dat de grootste risicoreductie tussen 5 en 15 posities zit — daaronder voel je elke één-bedrijf-fout zwaar.`,
          metric: input.positionCount,
          threshold: MIN_POSITIONS_DEFAULT,
          reflectionQuestions: UNDER_DIVERS_REFLECTION,
          nextStep:
            "Een breed-internationale ETF kan een snelle manier zijn om de diversificatie-floor te halen zonder veel research.",
          sourceEngines: ["portfolio-view"],
        },
        input.asOf,
      ),
    ],
  };
}

// ============================================================
//  7. Cash mismatch — te veel cash (drag) of te weinig (geen buffer)
// ============================================================

const CASH_DRAG_REFLECTION: BehavioralReflectionQuestion[] = [
  {
    key: "cash_drag_purpose",
    question: "Heeft de cash-allocatie een bewust doel (buffer, opportunity-pool, kortetermijnplan)?",
    hint: "Een doelloze cash-buffer kost ~3–5% per jaar in opportunity-cost; één met een doel is normaal.",
  },
];

const CASH_BUFFER_REFLECTION: BehavioralReflectionQuestion[] = [
  {
    key: "cash_emergency",
    question: "Hoe ga je een onverwachte uitgave (auto, dak, baan) opvangen — zonder te moeten verkopen?",
    hint: "Een beleggingsportefeuille zonder cash-buffer dwingt je om in een dip te verkopen — precies het verkeerde moment.",
  },
];

export function detectCashMismatch(
  input: BehavioralDetectorInput,
): DetectorResult {
  if (input.totalValue <= 0) return { signals: [], skipReason: "no-value" };
  const cashShare = input.cashBalance / input.totalValue;

  const targetMin = input.profile?.cashBufferPct ?? 0.05;
  const targetMax = input.profile?.maxCashShare ?? 0.25;

  // Te veel cash → drag
  if (cashShare > targetMax) {
    const severity: BehavioralSeverity =
      cashShare > 0.40 ? "elevated" : "moderate";
    return {
      signals: [
        makeSignal(
          {
            id: "CASH_MISMATCH:DRAG",
            key: "CASH_MISMATCH",
            severity,
            title: `${pct(cashShare)} cash — mogelijk drag op rendement`,
            message: `Met ${pct(cashShare)} cash boven je policy-grens van ${pct(targetMax)} loopt je portefeuille rendement mis. Het is normaal cash op te bouwen voor een specifieke kans, maar een doelloze buffer kost je tijd.`,
            metric: cashShare,
            threshold: targetMax,
            reflectionQuestions: CASH_DRAG_REFLECTION,
            nextStep:
              "Werk in stappen — een DCA-plan over 3–6 maanden verkleint timing-risico bij het aan-het-werk-zetten.",
            sourceEngines: ["portfolio-view"],
          },
          input.asOf,
        ),
      ],
    };
  }

  // Te weinig cash → geen buffer
  if (cashShare < targetMin * 0.4) {
    const severity: BehavioralSeverity =
      cashShare < 0.01 ? "elevated" : "moderate";
    return {
      signals: [
        makeSignal(
          {
            id: "CASH_MISMATCH:NO_BUFFER",
            key: "CASH_MISMATCH",
            severity,
            title: `Slechts ${pct(cashShare)} cash — beperkte buffer`,
            message: `Een minimale cash-buffer dwingt je om te verkopen tijdens een dip als er onverwachte uitgaven komen. Dat is exact het moment waarop je niet wilt verkopen.`,
            metric: cashShare,
            threshold: targetMin,
            reflectionQuestions: CASH_BUFFER_REFLECTION,
            nextStep:
              "Overweeg een buffer van 3–6 maanden vaste lasten op een aparte rekening — niet per se in de portefeuille.",
            sourceEngines: ["portfolio-view", "profile"],
          },
          input.asOf,
        ),
      ],
    };
  }

  return { signals: [] };
}

// ============================================================
//  8. Performance chasing — kopen wat al hard liep
// ============================================================

const PERF_CHASING_REFLECTION: BehavioralReflectionQuestion[] = [
  {
    key: "perf_chasing_thesis",
    question:
      "Koop je deze positie omdat de thesis sterker geworden is, of omdat de koers gestegen is?",
    hint:
      "Performance chasing is een van de duurste gewoontes in beleggen — winnaars draaien vaak om wanneer de bredere mass aan instapt.",
  },
];

export function detectPerformanceChasing(
  input: BehavioralDetectorInput,
): DetectorResult {
  const buys = input.recentTransactions.filter((t) => t.type === "BUY");
  if (buys.length === 0) {
    return { signals: [], skipReason: "no-buys" };
  }

  // Map ticker → P&L vandaag (alleen positief, fractie).
  const pnlByTicker = new Map<string, BehavioralPosition>();
  for (const pos of input.positions) {
    pnlByTicker.set(pos.ticker, pos);
  }

  const signals: BehavioralSignal[] = [];
  const alreadyFlagged = new Set<string>();
  for (const buy of buys) {
    if (alreadyFlagged.has(buy.ticker)) continue;
    const pos = pnlByTicker.get(buy.ticker);
    if (!pos) continue;
    if (pos.pnlPct < PERFORMANCE_CHASING_PNL_PCT) continue;
    alreadyFlagged.add(buy.ticker);

    const severity: BehavioralSeverity =
      pos.pnlPct >= 0.80 ? "elevated" : "moderate";
    signals.push(
      makeSignal(
        {
          id: `PERFORMANCE_CHASING:${buy.ticker}`,
          key: "PERFORMANCE_CHASING",
          severity,
          title: `Bijgekocht in ${buy.ticker} terwijl positie al ${signedPct(pos.pnlPct)} stond`,
          message: `Bijkopen in een sterk gestegen positie verhoogt je gemiddelde kostprijs en kan duiden op extrapoleren van rendement. Soms terecht (groeiende convictie), soms automatisch.`,
          metric: pos.pnlPct,
          threshold: PERFORMANCE_CHASING_PNL_PCT,
          reflectionQuestions: PERF_CHASING_REFLECTION,
          ticker: buy.ticker,
          nextStep:
            "Een vooraf-vastgelegd target-gewicht voorkomt dat een winnaar je portefeuille onbedoeld domineert.",
          sourceEngines: ["transactions", "portfolio-view"],
        },
        input.asOf,
      ),
    );
  }

  return { signals };
}

// ============================================================
//  9. Volatility mismatch — portfolio-vol vs profile-risk
// ============================================================

const VOL_MISMATCH_REFLECTION: BehavioralReflectionQuestion[] = [
  {
    key: "vol_horizon",
    question:
      "Past de huidige volatiliteit bij hoe lang je dit geld nog niet nodig hebt?",
    hint: "Lange horizon = drawdowns zijn beter te dragen; korte horizon = hoge vol kan onverwacht pijnlijk uitpakken bij opname.",
  },
  {
    key: "vol_sleeptest",
    question:
      "Slaap je rustig bij een tijdelijke drawdown van 30–40% op de huidige volatiliteit?",
    hint: "Als het antwoord nee is, is de afstand tussen profiel en portefeuille meestal te groot.",
  },
];

/**
 * Drempels — portfolio-volatility per risk-tolerance.
 * Geannualiseerde standaarddeviatie (fractie).
 */
const VOL_PROFILE_CEILING: Record<string, number> = {
  CONSERVATIVE: 0.10,
  BALANCED: 0.18,
  GROWTH: 0.25,
  AGGRESSIVE: 0.40,
};

export function detectVolatilityMismatch(
  input: BehavioralDetectorInput,
): DetectorResult {
  const vol = input.portfolioVolatility;
  if (typeof vol !== "number" || !Number.isFinite(vol)) {
    return { signals: [], skipReason: "no-volatility-data" };
  }
  const tolerance = input.profile?.riskTolerance ?? "BALANCED";
  const ceiling = VOL_PROFILE_CEILING[tolerance] ?? 0.18;
  if (vol <= ceiling) return { signals: [] };

  const overshoot = vol - ceiling;
  let severity: BehavioralSeverity = "moderate";
  if (overshoot >= 0.15) severity = "high";
  else if (overshoot >= 0.08) severity = "elevated";

  return {
    signals: [
      makeSignal(
        {
          id: `VOLATILITY_MISMATCH:${tolerance}`,
          key: "VOLATILITY_MISMATCH",
          severity,
          title: `Volatiliteit ${pct(vol)} ligt boven je ${tolerance.toLowerCase()}-profiel`,
          message: `Je portefeuille beweegt sterker dan past bij een ${tolerance.toLowerCase()}-profiel (richtlijn maximum ${pct(ceiling)}). Dat hoeft geen probleem te zijn als je bewust meer risico neemt, maar het maakt drawdowns scherper.`,
          metric: vol,
          threshold: ceiling,
          reflectionQuestions: VOL_MISMATCH_REFLECTION,
          nextStep:
            "Overweeg of je je profiel wilt bijstellen, of een deel te shiften naar minder-volatiele componenten (bonds, defensieve ETF's).",
          sourceEngines: ["risk-engine", "user-profile"],
        },
        input.asOf,
      ),
    ],
  };
}

// ============================================================
//  10. Speculative overallocation — crypto/commodity asset-class share
// ============================================================

const SPEC_REFLECTION: BehavioralReflectionQuestion[] = [
  {
    key: "spec_thesis",
    question:
      "Heb je een expliciete thesis voor het speculatieve deel, of is het een 'misschien-wordt-het-veel'-gok?",
    hint: "Speculatieve allocatie zonder thesis is een gokje, geen beleggingsbeslissing.",
  },
  {
    key: "spec_loss_tolerance",
    question:
      "Kun je een verlies van 50–70% op dit deel dragen zonder dat je gedwongen wordt te verkopen?",
    hint: "Speculatieve activa kunnen jaren onder water blijven; de allocatie moet daarmee passen.",
  },
];

const SPECULATIVE_ASSET_CLASSES = new Set(["CRYPTO", "COMMODITY"]);

const SPECULATIVE_TIERS: ReadonlyArray<{
  weight: number;
  severity: BehavioralSeverity;
}> = [
  { weight: 0.30, severity: "high" },
  { weight: 0.15, severity: "elevated" },
  { weight: 0.08, severity: "moderate" },
];

export function detectSpeculativeOverallocation(
  input: BehavioralDetectorInput,
): DetectorResult {
  if (input.positions.length === 0) {
    return { signals: [], skipReason: "no-positions" };
  }
  // Som alleen posities met expliciete asset-class. Wanneer NIEMAND
  // assetClass heeft, kan de detector niet beoordelen.
  const hasAnyAssetClass = input.positions.some(
    (p) => typeof p.assetClass === "string" && p.assetClass.length > 0,
  );
  if (!hasAnyAssetClass) {
    return { signals: [], skipReason: "no-asset-class-data" };
  }
  const speculativeWeight = input.positions
    .filter(
      (p) =>
        typeof p.assetClass === "string" &&
        SPECULATIVE_ASSET_CLASSES.has(p.assetClass.toUpperCase()),
    )
    .reduce((sum, p) => sum + p.weight, 0);

  if (speculativeWeight <= 0) {
    return { signals: [] };
  }
  const tier = SPECULATIVE_TIERS.find((t) => speculativeWeight >= t.weight);
  if (!tier) return { signals: [] };

  return {
    signals: [
      makeSignal(
        {
          id: "SPECULATIVE_OVERALLOCATION:GLOBAL",
          key: "SPECULATIVE_OVERALLOCATION",
          severity: tier.severity,
          title: `Speculatieve activa zijn ${pct(speculativeWeight)} van je portefeuille`,
          message: `Crypto + commodities samen wegen ${pct(speculativeWeight)}. Deze categorie heeft historisch grotere drawdowns en lange-droogteperiodes dan aandelen of obligaties.`,
          metric: speculativeWeight,
          threshold: tier.weight,
          reflectionQuestions: SPEC_REFLECTION,
          nextStep:
            "Veel langetermijnbeleggers houden speculatieve activa onder 5–10% van het totaal — een bewuste keuze daarboven kan, maar wel met een thesis.",
          sourceEngines: ["portfolio-view"],
        },
        input.asOf,
      ),
    ],
  };
}

// ============================================================
//  Public registry — engine.ts roept deze in volgorde aan.
// ============================================================

export const ALL_DETECTORS: ReadonlyArray<{
  key: BehavioralSignalKey;
  detect: (input: BehavioralDetectorInput) => DetectorResult;
}> = [
  { key: "OVERCONCENTRATION", detect: detectOverconcentration },
  { key: "OVERTRADING", detect: detectOvertrading },
  { key: "PANIC_SELLING", detect: detectPanicSelling },
  { key: "FOMO_BUYING", detect: detectFomoBuying },
  { key: "STRATEGY_DRIFT", detect: detectStrategyDrift },
  { key: "UNDER_DIVERSIFICATION", detect: detectUnderDiversification },
  { key: "CASH_MISMATCH", detect: detectCashMismatch },
  { key: "PERFORMANCE_CHASING", detect: detectPerformanceChasing },
  { key: "VOLATILITY_MISMATCH", detect: detectVolatilityMismatch },
  { key: "SPECULATIVE_OVERALLOCATION", detect: detectSpeculativeOverallocation },
];
