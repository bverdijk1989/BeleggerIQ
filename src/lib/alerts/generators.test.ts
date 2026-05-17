import { describe, expect, it } from "vitest";

import {
  generateAiBriefingReadyAlerts,
  generateBehavioralAlerts,
  generateConcentrationAlerts,
  generateDividendEventAlerts,
  generateEarningsEventAlerts,
  generateHealthDropAlerts,
  generateMacroRegimeChangeAlerts,
  generatePriceMoveAlerts,
  generateValuationSignalAlerts,
  generateWatchlistAlerts,
  generateWatchlistIntelligenceAlerts,
} from "./generators";

const ASOF = "2026-05-10T12:00:00.000Z";
const USER = "u-1";

describe("generateHealthDropAlerts", () => {
  it("score onder 50 → WARNING", () => {
    const out = generateHealthDropAlerts({
      userId: USER,
      asOf: ASOF,
      current: 42,
      previous: 60,
      currentGrade: "D",
    });
    expect(out.length).toBeGreaterThanOrEqual(1);
    const below = out.find((a) => a.dedupeKey.includes("below"));
    expect(below?.severity).toBe("WARNING");
  });

  it("daling van 5+ punten → WARNING", () => {
    const out = generateHealthDropAlerts({
      userId: USER,
      asOf: ASOF,
      current: 70,
      previous: 78,
      currentGrade: "B",
    });
    expect(out.find((a) => a.dedupeKey.includes("drop-5"))?.severity).toBe("WARNING");
  });

  it("daling van 12+ punten → CRITICAL", () => {
    const out = generateHealthDropAlerts({
      userId: USER,
      asOf: ASOF,
      current: 60,
      previous: 78,
      currentGrade: "C",
    });
    expect(out.find((a) => a.dedupeKey.includes("drop-12"))?.severity).toBe(
      "CRITICAL",
    );
  });

  it("kleine fluctuatie → geen alert", () => {
    const out = generateHealthDropAlerts({
      userId: USER,
      asOf: ASOF,
      current: 75,
      previous: 76,
      currentGrade: "B",
    });
    expect(out).toHaveLength(0);
  });
});

describe("generateConcentrationAlerts", () => {
  it("positie ≥ 30% → CRITICAL", () => {
    const out = generateConcentrationAlerts({
      userId: USER,
      asOf: ASOF,
      positions: [{ ticker: "ASML", weight: 0.32, previousWeight: 0.30 }],
      sectors: [],
    });
    expect(out[0]?.severity).toBe("CRITICAL");
  });

  it("positie ≥ 20% maar < 30% → WARNING", () => {
    const out = generateConcentrationAlerts({
      userId: USER,
      asOf: ASOF,
      positions: [{ ticker: "ASML", weight: 0.22, previousWeight: 0.20 }],
      sectors: [],
    });
    expect(out[0]?.severity).toBe("WARNING");
  });

  it("positie < 20% maar +3pt rising → INFO", () => {
    const out = generateConcentrationAlerts({
      userId: USER,
      asOf: ASOF,
      positions: [{ ticker: "ASML", weight: 0.13, previousWeight: 0.09 }],
      sectors: [],
    });
    expect(out[0]?.severity).toBe("INFO");
  });

  it("sector ≥ 45% → WARNING", () => {
    const out = generateConcentrationAlerts({
      userId: USER,
      asOf: ASOF,
      positions: [],
      sectors: [{ label: "Technology", weight: 0.50, previousWeight: 0.45 }],
    });
    expect(out[0]?.severity).toBe("WARNING");
  });

  it("alles binnen drempels → geen alerts", () => {
    const out = generateConcentrationAlerts({
      userId: USER,
      asOf: ASOF,
      positions: [{ ticker: "ASML", weight: 0.10, previousWeight: 0.09 }],
      sectors: [{ label: "Tech", weight: 0.30, previousWeight: 0.30 }],
    });
    expect(out).toHaveLength(0);
  });
});

describe("generatePriceMoveAlerts", () => {
  it("+5% → INFO", () => {
    const out = generatePriceMoveAlerts({
      userId: USER,
      asOf: ASOF,
      positions: [
        { ticker: "ASML", name: "ASML", dayChange: 0.06, weight: 0.05 },
      ],
    });
    expect(out[0]?.severity).toBe("INFO");
  });

  it("+10% → WARNING", () => {
    const out = generatePriceMoveAlerts({
      userId: USER,
      asOf: ASOF,
      positions: [
        { ticker: "X", name: "X", dayChange: 0.12, weight: 0.05 },
      ],
    });
    expect(out[0]?.severity).toBe("WARNING");
  });

  it("-2% (binnen ruis) → geen alert", () => {
    const out = generatePriceMoveAlerts({
      userId: USER,
      asOf: ASOF,
      positions: [{ ticker: "X", name: "X", dayChange: -0.02, weight: 0.05 }],
    });
    expect(out).toHaveLength(0);
  });

  it("kleine positie (< 1%) bij 6% move → skip (Buffett-laag)", () => {
    const out = generatePriceMoveAlerts({
      userId: USER,
      asOf: ASOF,
      positions: [{ ticker: "X", name: "X", dayChange: 0.06, weight: 0.005 }],
    });
    expect(out).toHaveLength(0);
  });

  it("kleine positie maar EXTREME move (>10%) → wel alert", () => {
    const out = generatePriceMoveAlerts({
      userId: USER,
      asOf: ASOF,
      positions: [{ ticker: "X", name: "X", dayChange: 0.15, weight: 0.005 }],
    });
    expect(out).toHaveLength(1);
  });
});

describe("generateMacroRegimeChangeAlerts", () => {
  it("regime-wissel → WARNING", () => {
    const out = generateMacroRegimeChangeAlerts({
      userId: USER,
      asOf: ASOF,
      previous: "GOLDILOCKS",
      current: "STAGFLATION",
    });
    expect(out[0]?.severity).toBe("WARNING");
    expect(out[0]?.title).toMatch(/GOLDILOCKS.*STAGFLATION/);
  });

  it("zelfde regime → geen alert", () => {
    const out = generateMacroRegimeChangeAlerts({
      userId: USER,
      asOf: ASOF,
      previous: "GOLDILOCKS",
      current: "GOLDILOCKS",
    });
    expect(out).toHaveLength(0);
  });

  it("eerste meting (previous null) → geen alert", () => {
    const out = generateMacroRegimeChangeAlerts({
      userId: USER,
      asOf: ASOF,
      previous: null,
      current: "STAGFLATION",
    });
    expect(out).toHaveLength(0);
  });

  it("transitional periode → geen alert", () => {
    const out = generateMacroRegimeChangeAlerts({
      userId: USER,
      asOf: ASOF,
      previous: "TRANSITIONAL",
      current: "GOLDILOCKS",
    });
    expect(out).toHaveLength(0);
  });
});

describe("generateBehavioralAlerts", () => {
  it("nieuw moderate signaal → INFO", () => {
    const out = generateBehavioralAlerts({
      userId: USER,
      asOf: ASOF,
      signals: [
        {
          id: "OVERTRADING:GLOBAL",
          title: "12 trades in 30 dagen",
          severity: "moderate",
          isNew: true,
        },
      ],
    });
    expect(out[0]?.severity).toBe("INFO");
  });

  it("nieuw high-severity signaal → CRITICAL", () => {
    const out = generateBehavioralAlerts({
      userId: USER,
      asOf: ASOF,
      signals: [
        {
          id: "OVERCONCENTRATION:ASML",
          title: "ASML weegt 35%",
          severity: "high",
          isNew: true,
        },
      ],
    });
    expect(out[0]?.severity).toBe("CRITICAL");
  });

  it("oud signaal (isNew=false) → geen alert", () => {
    const out = generateBehavioralAlerts({
      userId: USER,
      asOf: ASOF,
      signals: [
        {
          id: "X",
          title: "X",
          severity: "high",
          isNew: false,
        },
      ],
    });
    expect(out).toHaveLength(0);
  });

  it("low-severity signaal → geen alert (Buffett-laag)", () => {
    const out = generateBehavioralAlerts({
      userId: USER,
      asOf: ASOF,
      signals: [
        { id: "X", title: "X", severity: "low", isNew: true },
      ],
    });
    expect(out).toHaveLength(0);
  });
});

describe("generateEarningsEventAlerts", () => {
  it("event in feed → alert", () => {
    const out = generateEarningsEventAlerts({
      userId: USER,
      asOf: ASOF,
      events: [
        {
          ticker: "ASML",
          name: "ASML Holding",
          earningsDate: "2026-05-15T00:00:00.000Z",
        },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.title).toContain("ASML");
  });

  it("lege feed → geen alerts", () => {
    const out = generateEarningsEventAlerts({
      userId: USER,
      asOf: ASOF,
      events: [],
    });
    expect(out).toHaveLength(0);
  });
});

describe("generateDividendEventAlerts", () => {
  it("ex-dividend datum → alert met bedrag", () => {
    const out = generateDividendEventAlerts({
      userId: USER,
      asOf: ASOF,
      events: [
        {
          ticker: "RDS",
          name: "Royal Dutch",
          exDate: "2026-05-15T00:00:00.000Z",
          amount: 0.45,
          currency: "EUR",
        },
      ],
    });
    expect(out[0]?.body).toMatch(/0\.45/);
    expect(out[0]?.body).toMatch(/EUR/);
  });
});

describe("generateWatchlistAlerts", () => {
  it("BELOW-target hit → INFO", () => {
    const out = generateWatchlistAlerts({
      userId: USER,
      asOf: ASOF,
      hits: [
        {
          ticker: "ASML",
          name: "ASML",
          currentPrice: 580,
          targetPrice: 600,
          direction: "BELOW",
          currency: "EUR",
        },
      ],
    });
    expect(out[0]?.severity).toBe("INFO");
    expect(out[0]?.title).toContain("ASML");
  });
});

describe("generateWatchlistIntelligenceAlerts (Module 9)", () => {
  it("STRONG_OPPORTUNITY-tier triggert een alert met top-positive signal", () => {
    const out = generateWatchlistIntelligenceAlerts({
      userId: USER,
      asOf: ASOF,
      hits: [
        {
          ticker: "ASML",
          name: "ASML",
          tier: "STRONG_OPPORTUNITY",
          topPositive: {
            label: "Waardering",
            rationale: "Value-score 80, P/E 15.",
            strength: 75,
          },
          topNegative: null,
        },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.type).toBe("WATCHLIST_OPPORTUNITY");
    expect(out[0]?.title.toLowerCase()).toContain("sterke kans");
    expect(out[0]?.dedupeKey).toContain("STRONG");
  });

  it("Mixed-tier (sterke + en -) triggert aandacht-alert", () => {
    const out = generateWatchlistIntelligenceAlerts({
      userId: USER,
      asOf: ASOF,
      hits: [
        {
          ticker: "TSLA",
          name: "Tesla",
          tier: "NEUTRAL",
          topPositive: {
            label: "Momentum",
            rationale: "12mnd return +35%.",
            strength: 80,
          },
          topNegative: {
            label: "Volatiliteit",
            rationale: "Vol gestegen naar 45%.",
            strength: 70,
          },
        },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.title.toLowerCase()).toContain("gemengd");
    expect(out[0]?.dedupeKey).toContain("MIXED");
  });

  it("WAIT-tier zonder mixed → géén alert (geen ruis)", () => {
    const out = generateWatchlistIntelligenceAlerts({
      userId: USER,
      asOf: ASOF,
      hits: [
        {
          ticker: "X",
          name: "X",
          tier: "WAIT",
          topPositive: null,
          topNegative: null,
        },
      ],
    });
    expect(out).toHaveLength(0);
  });

  it("dedupeKey is idempotent (zelfde input → zelfde key)", () => {
    const input = {
      userId: USER,
      asOf: ASOF,
      hits: [
        {
          ticker: "ASML",
          name: "ASML",
          tier: "STRONG_OPPORTUNITY" as const,
          topPositive: {
            label: "Waardering",
            rationale: "X",
            strength: 75,
          },
          topNegative: null,
        },
      ],
    };
    const a = generateWatchlistIntelligenceAlerts(input);
    const b = generateWatchlistIntelligenceAlerts(input);
    expect(a[0]?.dedupeKey).toBe(b[0]?.dedupeKey);
  });
});

describe("generateValuationSignalAlerts", () => {
  it("hoge value-score → alert", () => {
    const out = generateValuationSignalAlerts({
      userId: USER,
      asOf: ASOF,
      positions: [
        {
          ticker: "MSFT",
          name: "Microsoft",
          valueSubScore: 75,
          fcfYield: null,
        },
      ],
    });
    expect(out).toHaveLength(1);
  });

  it("hoge FCF-yield → alert", () => {
    const out = generateValuationSignalAlerts({
      userId: USER,
      asOf: ASOF,
      positions: [
        {
          ticker: "X",
          name: "X",
          valueSubScore: 50,
          fcfYield: 0.08,
        },
      ],
    });
    expect(out).toHaveLength(1);
  });

  it("max 5 valuation-alerts per run", () => {
    const positions = Array.from({ length: 10 }, (_, i) => ({
      ticker: `T${i}`,
      name: `Ticker ${i}`,
      valueSubScore: 80,
      fcfYield: null,
    }));
    const out = generateValuationSignalAlerts({
      userId: USER,
      asOf: ASOF,
      positions,
    });
    expect(out).toHaveLength(5);
  });
});

describe("generateAiBriefingReadyAlerts", () => {
  it("levert exact 1 alert per run", () => {
    const out = generateAiBriefingReadyAlerts({
      userId: USER,
      asOf: ASOF,
      briefingDate: "2026-05-10",
      headline: "Portefeuille +1.2% — let op concentratie ASML.",
      mode: "ai",
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.body).toContain("Portefeuille");
  });

  it("dedupeKey is deterministisch op dag", () => {
    const a = generateAiBriefingReadyAlerts({
      userId: USER,
      asOf: ASOF,
      briefingDate: "2026-05-10",
      headline: "X",
      mode: "ai",
    });
    const b = generateAiBriefingReadyAlerts({
      userId: USER,
      asOf: ASOF,
      briefingDate: "2026-05-10",
      headline: "Y",
      mode: "ai",
    });
    expect(a[0]?.dedupeKey).toBe(b[0]?.dedupeKey);
  });
});
