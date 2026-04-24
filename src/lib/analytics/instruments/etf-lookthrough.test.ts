import { describe, expect, it } from "vitest";

import { classifyEtfByName } from "./etf-lookthrough";

describe("classifyEtfByName", () => {
  describe("leveraged / inverse (voorrang)", () => {
    it("herkent 3x leveraged via keyword", () => {
      const r = classifyEtfByName({ name: "ProShares UltraPro QQQ 3x" });
      expect(r.type).toBe("LEVERAGED_OR_INVERSE");
      expect(r.isBroadMarket).toBe(false);
    });

    it("herkent inverse ETFs", () => {
      const r = classifyEtfByName({ name: "ProShares Short S&P 500" });
      expect(r.type).toBe("LEVERAGED_OR_INVERSE");
    });

    it("leveraged slaat broad-market match over", () => {
      // "S&P 500 3x" matcht zowel broad-market als leveraged — leveraged wint.
      const r = classifyEtfByName({ name: "Direxion Daily S&P 500 Bull 3x" });
      expect(r.type).toBe("LEVERAGED_OR_INVERSE");
    });
  });

  describe("covered call", () => {
    it("herkent expliciete covered call", () => {
      const r = classifyEtfByName({ name: "Global X Nasdaq 100 Covered Call ETF" });
      expect(r.type).toBe("INCOME_ETF");
      expect(r.incomeStrategy).toBe("covered-call");
    });

    it("herkent bekende tickers (JEPI, QYLD, ...)", () => {
      expect(classifyEtfByName({ name: "JEPI Premium Income" }).incomeStrategy).toBe(
        "covered-call",
      );
      expect(classifyEtfByName({ name: "QYLD Buy-Write" }).incomeStrategy).toBe(
        "covered-call",
      );
    });

    it("covered-call slaat high-dividend-match over (specifieker)", () => {
      const r = classifyEtfByName({ name: "High Dividend Covered Call Fund" });
      expect(r.incomeStrategy).toBe("covered-call");
    });
  });

  describe("bond ETFs", () => {
    it("herkent aggregate + treasury", () => {
      expect(classifyEtfByName({ name: "iShares Core US Aggregate Bond" }).type).toBe(
        "BOND_ETF",
      );
      expect(classifyEtfByName({ name: "iShares 20+ Year Treasury Bond" }).type).toBe(
        "BOND_ETF",
      );
    });

    it("bond-income wordt INCOME_ETF met bond-heavy strategie", () => {
      const r = classifyEtfByName({
        name: "iShares Corporate Bond Income Fund",
      });
      expect(r.type).toBe("INCOME_ETF");
      expect(r.incomeStrategy).toBe("bond-heavy");
    });
  });

  describe("high-dividend (non-covered-call)", () => {
    it("herkent high dividend + SCHD", () => {
      expect(
        classifyEtfByName({ name: "Schwab US Dividend Equity SCHD" }).incomeStrategy,
      ).toBe("high-dividend");
      expect(
        classifyEtfByName({ name: "iShares High Dividend" }).incomeStrategy,
      ).toBe("high-dividend");
    });
  });

  describe("broad market", () => {
    it("herkent IWDA / VWCE / VUSA / S&P 500", () => {
      const names = [
        "iShares Core MSCI World IWDA",
        "Vanguard FTSE All-World VWCE",
        "Vanguard S&P 500 UCITS ETF VUSA",
        "SPDR S&P 500",
      ];
      for (const name of names) {
        const r = classifyEtfByName({ name });
        expect(r.type).toBe("BROAD_MARKET_ETF");
        expect(r.isBroadMarket).toBe(true);
      }
    });

    it("broad-market + sector-keyword → SECTOR_ETF (meer specifiek)", () => {
      const r = classifyEtfByName({
        name: "S&P 500 Information Technology Sector",
      });
      expect(r.type).toBe("SECTOR_ETF");
      expect(r.sectorFocus).toBe("Technology");
    });
  });

  describe("sector ETFs", () => {
    it("mapt bekende sectoren", () => {
      const cases: Array<[string, string]> = [
        ["Technology Select Sector SPDR", "Technology"],
        ["iShares US Healthcare ETF", "Healthcare"],
        ["Financial Select SPDR", "Financials"],
        ["iShares Real Estate ETF", "Real Estate"],
      ];
      for (const [name, expected] of cases) {
        expect(classifyEtfByName({ name }).sectorFocus).toBe(expected);
      }
    });
  });

  describe("factor ETFs", () => {
    it("herkent quality / momentum / min-vol", () => {
      expect(classifyEtfByName({ name: "iShares MSCI Quality Factor" }).type).toBe(
        "FACTOR_ETF",
      );
      expect(classifyEtfByName({ name: "iShares Momentum USA" }).type).toBe(
        "FACTOR_ETF",
      );
      expect(classifyEtfByName({ name: "iShares Min Vol Global" }).type).toBe(
        "FACTOR_ETF",
      );
    });
  });

  describe("theme ETFs", () => {
    it("AI / robotics / cybersec / cannabis zijn thema's", () => {
      expect(classifyEtfByName({ name: "Global X AI & Robotics" }).type).toBe(
        "THEME_ETF",
      );
      expect(classifyEtfByName({ name: "HACK Cybersecurity ETF" }).type).toBe(
        "THEME_ETF",
      );
      expect(classifyEtfByName({ name: "Cannabis Growers Fund" }).type).toBe(
        "THEME_ETF",
      );
    });

    it("biotech is een Healthcare sub-sector, GEEN theme", () => {
      // GICS-taxonomie: biotech valt onder Healthcare.
      const r = classifyEtfByName({ name: "iShares Biotech" });
      expect(r.type).toBe("SECTOR_ETF");
      expect(r.sectorFocus).toBe("Healthcare");
    });
  });

  describe("commodity", () => {
    it("goud / zilver / olie", () => {
      expect(classifyEtfByName({ name: "SPDR Gold Shares" }).type).toBe(
        "COMMODITY_ETF",
      );
      expect(classifyEtfByName({ name: "iShares Silver Trust" }).type).toBe(
        "COMMODITY_ETF",
      );
    });
  });

  describe("fallback", () => {
    it("niet herkenbare naam → UNKNOWN_ETF", () => {
      const r = classifyEtfByName({ name: "Weird Niche Fund XYZ" });
      expect(r.type).toBe("UNKNOWN_ETF");
    });

    it("enrichment-sector als laatste redmiddel → SECTOR_ETF", () => {
      const r = classifyEtfByName({
        name: "Totally Unknown Fund",
        enrichmentSector: "Healthcare",
      });
      expect(r.type).toBe("SECTOR_ETF");
      expect(r.sectorFocus).toBe("Healthcare");
      expect(r.rationale.some((r) => /yahoo-sector/i.test(r))).toBe(true);
    });
  });
});
