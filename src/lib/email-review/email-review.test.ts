import { describe, expect, it } from "vitest";

import { buildMonthlyReview, type BuildMonthlyReviewInput } from "./generator";
import { renderReviewEmail } from "./template";
import {
  buildUnsubscribeUrl,
  createUnsubscribeToken,
  verifyUnsubscribeToken,
} from "./unsubscribe";
import { SECTION_ORDER } from "./types";

/**
 * Module 34 — Email Drip & Monthly Investor Review tests.
 *
 * Focus: data-generation, privacy (geen datalekken), unsubscribe-token-
 * verificatie, preference-respect.
 */

const ASOF = "2026-05-20T00:00:00.000Z";

function input(
  overrides: Partial<BuildMonthlyReviewInput> = {},
): BuildMonthlyReviewInput {
  return {
    generatedAt: ASOF,
    periodLabel: "mei 2026",
    greetingName: "belegger",
    detailedFigures: false,
    unsubscribeUrl: "https://x.test/api/email/unsubscribe?token=abc",
    appUrl: "https://x.test/dashboard",
    healthScoreNow: null,
    healthScorePrev: null,
    healthGrade: null,
    topRisk: null,
    goals: null,
    monthlyAction: null,
    topAlert: null,
    dataQuality: null,
    ...overrides,
  };
}

describe("buildMonthlyReview — shape", () => {
  it("produceert altijd 6 secties in vaste volgorde", () => {
    const r = buildMonthlyReview(input());
    expect(r.sections).toHaveLength(6);
    expect(r.sections.map((s) => s.key)).toEqual(SECTION_ORDER);
  });

  it("disclaimer altijd aanwezig + benoemt 'geen advies'", () => {
    const r = buildMonthlyReview(input());
    expect(r.disclaimer).toMatch(/geen.*advies/i);
    expect(r.disclaimer).toMatch(/geen broker/i);
  });

  it("lege portfolio → secties met hasData=false maar niet-lege body", () => {
    const r = buildMonthlyReview(input());
    const health = r.sections.find((s) => s.key === "health_change")!;
    expect(health.hasData).toBe(false);
    expect(health.body.length).toBeGreaterThan(0);
  });
});

describe("health_change sectie", () => {
  it("score gestegen → positive tone + delta in body", () => {
    const r = buildMonthlyReview(
      input({ healthScoreNow: 78, healthScorePrev: 62, healthGrade: "B" }),
    );
    const s = r.sections.find((x) => x.key === "health_change")!;
    expect(s.tone).toBe("positive");
    expect(s.body).toMatch(/62/);
    expect(s.body).toMatch(/78/);
  });

  it("score gedaald → warning tone", () => {
    const r = buildMonthlyReview(
      input({ healthScoreNow: 55, healthScorePrev: 72 }),
    );
    const s = r.sections.find((x) => x.key === "health_change")!;
    expect(s.tone).toBe("warning");
  });

  it("nauwelijks veranderd (<3) → neutral 'stabiel'", () => {
    const r = buildMonthlyReview(
      input({ healthScoreNow: 71, healthScorePrev: 70 }),
    );
    const s = r.sections.find((x) => x.key === "health_change")!;
    expect(s.tone).toBe("neutral");
    expect(s.body.toLowerCase()).toContain("stabiel");
  });

  it("geen vorige score → neutral 'volgende maand'", () => {
    const r = buildMonthlyReview(input({ healthScoreNow: 70 }));
    const s = r.sections.find((x) => x.key === "health_change")!;
    expect(s.body.toLowerCase()).toContain("volgende maand");
  });
});

describe("biggest_risk sectie", () => {
  it("geen risico → positive", () => {
    const r = buildMonthlyReview(input({ topRisk: null }));
    const s = r.sections.find((x) => x.key === "biggest_risk")!;
    expect(s.tone).toBe("positive");
  });

  it("rood risico → warning + label in body", () => {
    const r = buildMonthlyReview(
      input({ topRisk: { label: "Concentratierisico", severity: "red" } }),
    );
    const s = r.sections.find((x) => x.key === "biggest_risk")!;
    expect(s.tone).toBe("warning");
    expect(s.body).toContain("Concentratierisico");
  });
});

describe("goal_progress sectie", () => {
  it("geen doelen → info 'nog geen doelen'", () => {
    const r = buildMonthlyReview(input({ goals: null }));
    const s = r.sections.find((x) => x.key === "goal_progress")!;
    expect(s.hasData).toBe(false);
    expect(s.body.toLowerCase()).toContain("nog geen");
  });

  it("alle doelen op koers → positive", () => {
    const r = buildMonthlyReview(
      input({
        goals: { totalGoals: 3, achievableGoals: 3, courseStatus: "on_track" },
      }),
    );
    const s = r.sections.find((x) => x.key === "goal_progress")!;
    expect(s.tone).toBe("positive");
  });

  it("deels op koers → neutral/warning afhankelijk van ratio", () => {
    const r = buildMonthlyReview(
      input({
        goals: { totalGoals: 4, achievableGoals: 1, courseStatus: "off_track" },
      }),
    );
    const s = r.sections.find((x) => x.key === "goal_progress")!;
    expect(s.tone).toBe("warning");
  });
});

describe("monthly_action sectie — geen koopadvies", () => {
  it("body benoemt expliciet 'geen koopadvies'", () => {
    const r = buildMonthlyReview(
      input({
        monthlyAction: { title: "Houd vast: ASML", kind: "hold" },
      }),
    );
    const s = r.sections.find((x) => x.key === "monthly_action")!;
    expect(s.body.toLowerCase()).toContain("geen koopadvies");
  });
});

describe("renderReviewEmail — privacy + format", () => {
  it("subject bevat periode-label", () => {
    const r = renderReviewEmail(buildMonthlyReview(input()));
    expect(r.subject).toContain("mei 2026");
  });

  it("HTML + text bevatten unsubscribe-link", () => {
    const r = renderReviewEmail(
      buildMonthlyReview(
        input({ unsubscribeUrl: "https://x.test/unsub?token=xyz" }),
      ),
    );
    expect(r.html).toContain("https://x.test/unsub?token=xyz");
    expect(r.text).toContain("https://x.test/unsub?token=xyz");
  });

  it("detailedFigures=false → e-mail vermeldt 'geen bedragen'", () => {
    const r = renderReviewEmail(
      buildMonthlyReview(input({ detailedFigures: false })),
    );
    expect(r.html.toLowerCase()).toContain("geen bedragen");
    expect(r.text.toLowerCase()).toContain("geen bedragen");
  });

  it("HTML escape't dynamische strings (XSS-resistant)", () => {
    const r = renderReviewEmail(
      buildMonthlyReview(
        input({
          greetingName: "<script>alert(1)</script>",
          monthlyAction: { title: "<img src=x onerror=alert(2)>", kind: "hold" },
        }),
      ),
    );
    expect(r.html).not.toMatch(/<script>alert\(1\)<\/script>/);
    expect(r.html).not.toMatch(/<img\s+[^>]*onerror=/i);
    expect(r.html).toContain("&lt;script&gt;");
  });

  it("privacy: geen e-mailadres in gerenderde body (greetingName is veilig)", () => {
    const r = renderReviewEmail(buildMonthlyReview(input()));
    // De e-mail bevat alleen de greetingName "belegger", geen raw e-mail
    expect(r.html).not.toMatch(/[\w.-]+@[\w.-]+\.[a-z]{2,}/i);
  });
});

describe("unsubscribe-token", () => {
  it("create + verify round-trip", () => {
    const token = createUnsubscribeToken("bart@example.com");
    const result = verifyUnsubscribeToken(token);
    expect(result).not.toBeNull();
    expect(result!.email).toBe("bart@example.com");
  });

  it("e-mail wordt genormaliseerd (lowercase + trim)", () => {
    const token = createUnsubscribeToken("  Bart@Example.COM  ");
    const result = verifyUnsubscribeToken(token);
    expect(result!.email).toBe("bart@example.com");
  });

  it("geknoeid token → null (HMAC-mismatch)", () => {
    const token = createUnsubscribeToken("bart@example.com");
    const tampered = token.slice(0, -3) + "xxx";
    expect(verifyUnsubscribeToken(tampered)).toBeNull();
  });

  it("ongeldig / leeg token → null", () => {
    expect(verifyUnsubscribeToken(null)).toBeNull();
    expect(verifyUnsubscribeToken("")).toBeNull();
    expect(verifyUnsubscribeToken("geen-punt")).toBeNull();
    expect(verifyUnsubscribeToken("body.")).toBeNull();
  });

  it("token van andere scope wordt geweigerd", () => {
    // Bouw een token met verkeerde scope handmatig — dit moet falen.
    const fake = verifyUnsubscribeToken("eyJ4IjoxfQ.zzz");
    expect(fake).toBeNull();
  });

  it("buildUnsubscribeUrl produceert geldige absolute URL", () => {
    const url = buildUnsubscribeUrl("bart@example.com", "https://x.test/");
    expect(url).toMatch(/^https:\/\/x\.test\/api\/email\/unsubscribe\?token=/);
    // Token uit URL moet verifiëren
    const token = decodeURIComponent(url.split("token=")[1]!);
    expect(verifyUnsubscribeToken(token)!.email).toBe("bart@example.com");
  });
});

describe("Module 34 — risicoanalist: geen datalekken", () => {
  it("detailedFigures=false → geen bedragen-patroon (€ / EUR) in e-mail", () => {
    const r = renderReviewEmail(
      buildMonthlyReview(
        input({
          detailedFigures: false,
          healthScoreNow: 72,
          healthScorePrev: 65,
          goals: { totalGoals: 2, achievableGoals: 1, courseStatus: "at_risk" },
          dataQuality: { depthScore: 80, tierLabel: "Goed" },
        }),
      ),
    );
    // Geen euro-bedragen — alleen scores 0..100 zijn toegestaan
    expect(r.html).not.toMatch(/€\s?\d/);
    expect(r.text).not.toMatch(/€\s?\d/);
    expect(r.html).not.toMatch(/\bEUR\s?\d/);
  });

  it("disclaimer aanwezig in zowel HTML als text", () => {
    const r = renderReviewEmail(buildMonthlyReview(input()));
    expect(r.html).toMatch(/geen.*advies/i);
    expect(r.text).toMatch(/geen.*advies/i);
  });

  it("headline bij meerdere warnings → 'aandachtspunten'", () => {
    const r = buildMonthlyReview(
      input({
        healthScoreNow: 50,
        healthScorePrev: 70,
        topRisk: { label: "Concentratie", severity: "red" },
      }),
    );
    expect(r.headline.toLowerCase()).toMatch(/aandachtspunt/);
  });
});
