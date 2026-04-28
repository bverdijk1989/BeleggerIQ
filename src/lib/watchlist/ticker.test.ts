import { describe, expect, it } from "vitest";

import { normalizeAndValidateTicker } from "./ticker";

describe("normalizeAndValidateTicker", () => {
  it("accepteert kale US-ticker", () => {
    const r = normalizeAndValidateTicker("AAPL");
    expect(r).toEqual({ ok: true, ticker: "AAPL" });
  });

  it("normaliseert lowercase + whitespace", () => {
    expect(normalizeAndValidateTicker("  aapl ")).toEqual({
      ok: true,
      ticker: "AAPL",
    });
  });

  it("accepteert exchange-suffix (Euronext) ASML.AS", () => {
    expect(normalizeAndValidateTicker("ASML.AS")).toEqual({
      ok: true,
      ticker: "ASML.AS",
    });
  });

  it("accepteert dash-tickers (BRK-B)", () => {
    expect(normalizeAndValidateTicker("brk-b")).toEqual({
      ok: true,
      ticker: "BRK-B",
    });
  });

  it("rejecteert lege string", () => {
    expect(normalizeAndValidateTicker("")).toEqual({
      ok: false,
      reason: "Ticker ontbreekt.",
    });
  });

  it("rejecteert null/undefined", () => {
    expect(normalizeAndValidateTicker(null).ok).toBe(false);
    expect(normalizeAndValidateTicker(undefined).ok).toBe(false);
  });

  it("rejecteert te lang (>16)", () => {
    const r = normalizeAndValidateTicker("ABCDEFGHIJKLMNOPQ");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/te lang/i);
  });

  it("rejecteert spaties tussen tekens", () => {
    expect(normalizeAndValidateTicker("AA PL").ok).toBe(false);
  });

  it("rejecteert quotes / shell-meta", () => {
    expect(normalizeAndValidateTicker("AAPL'; DROP--").ok).toBe(false);
    expect(normalizeAndValidateTicker('"AAPL"').ok).toBe(false);
  });

  it("rejecteert leidende '.' of '-'", () => {
    expect(normalizeAndValidateTicker(".AS").ok).toBe(false);
    expect(normalizeAndValidateTicker("-AAPL").ok).toBe(false);
  });
});
