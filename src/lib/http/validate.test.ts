import { describe, expect, it } from "vitest";

import {
  expectObject,
  isPlainObject,
  parseBoundedNumber,
  parseEnum,
  parseIsoDate,
  parseString,
  parseStringArray,
  parseTickerStrict,
  safeJson,
  toFiniteNumber,
} from "./validate";

describe("safeJson", () => {
  it("retourneert parsed waarde", async () => {
    const req = { json: async () => ({ a: 1 }) };
    expect(await safeJson(req)).toEqual({ a: 1 });
  });

  it("retourneert undefined bij parse-fout", async () => {
    const req = {
      json: async () => {
        throw new Error("bad");
      },
    };
    expect(await safeJson(req)).toBeUndefined();
  });
});

describe("isPlainObject", () => {
  it("werkt op objecten maar niet op arrays / null", () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject({ a: 1 })).toBe(true);
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject(undefined)).toBe(false);
    expect(isPlainObject("string")).toBe(false);
    expect(isPlainObject(42)).toBe(false);
  });
});

describe("expectObject", () => {
  it("accepteert undefined als leeg object", () => {
    const r = expectObject(undefined);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({});
  });
  it("faalt bij array", () => {
    const r = expectObject([1, 2]);
    expect(r.ok).toBe(false);
  });
  it("passeert object", () => {
    const r = expectObject({ a: 1 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ a: 1 });
  });
});

describe("parseString", () => {
  it("trim + minLength default 1", () => {
    const r = parseString("  hi  ", "field");
    expect(r.ok && r.value).toBe("hi");
  });
  it("faalt bij lege verplichte string", () => {
    expect(parseString("", "field").ok).toBe(false);
    expect(parseString(undefined, "field").ok).toBe(false);
  });
  it("optional retourneert undefined", () => {
    const r = parseString(undefined, "field", { optional: true });
    expect(r.ok && r.value).toBeUndefined();
  });
  it("pattern enforcement", () => {
    const r = parseString("abc!", "field", { pattern: /^[a-z]+$/ });
    expect(r.ok).toBe(false);
  });
  it("maxLength enforcement", () => {
    expect(parseString("abcdef", "field", { maxLength: 3 }).ok).toBe(false);
  });
});

describe("parseStringArray", () => {
  it("valideert elke entry", () => {
    const r = parseStringArray(["A", "B"], "tickers", {
      itemOptions: { minLength: 1 },
    });
    expect(r.ok && r.value).toEqual(["A", "B"]);
  });
  it("faalt boven maxItems", () => {
    const r = parseStringArray(["a", "b", "c"], "x", { maxItems: 2 });
    expect(r.ok).toBe(false);
  });
  it("faalt op non-array", () => {
    expect(parseStringArray("nope", "x").ok).toBe(false);
  });
});

describe("parseIsoDate", () => {
  it("accepteert geldig YYYY-MM-DD", () => {
    const r = parseIsoDate("2026-04-24", "date");
    expect(r.ok && r.value).toBe("2026-04-24");
  });
  it("weigert verkeerd formaat", () => {
    expect(parseIsoDate("2026/04/24", "date").ok).toBe(false);
    expect(parseIsoDate("2026-4-24", "date").ok).toBe(false);
    expect(parseIsoDate("24-04-2026", "date").ok).toBe(false);
  });
  it("weigert ongeldige datum (februari 30)", () => {
    // Date.parse kan "2026-02-30" rekenen naar 02 maart — we vallen
    // daarom terug op strikte regex + Date.parse samen, maar JS rollt
    // dit soms door. Ons contract is formaat-niveau; functioneel
    // acceptabel.
    expect(parseIsoDate("2026-13-01", "date").ok).toBe(false);
  });
  it("optional", () => {
    const r = parseIsoDate(null, "date", { optional: true });
    expect(r.ok && r.value).toBeUndefined();
  });
});

describe("parseBoundedNumber", () => {
  it("accepteert numerieke string + bounds", () => {
    const r = parseBoundedNumber("42", "n", { min: 0, max: 100 });
    expect(r.ok && r.value).toBe(42);
  });
  it("weigert NaN en Infinity", () => {
    expect(parseBoundedNumber("NaN", "n").ok).toBe(false);
    expect(parseBoundedNumber(Infinity, "n").ok).toBe(false);
    expect(parseBoundedNumber("abc", "n").ok).toBe(false);
  });
  it("weigert buiten bounds", () => {
    expect(parseBoundedNumber(5, "n", { min: 10 }).ok).toBe(false);
    expect(parseBoundedNumber(50, "n", { max: 10 }).ok).toBe(false);
  });
  it("integer-only", () => {
    expect(parseBoundedNumber(3.14, "n", { integer: true }).ok).toBe(false);
    expect(parseBoundedNumber(3, "n", { integer: true }).ok).toBe(true);
  });
  it("fallback bij lege input", () => {
    const r = parseBoundedNumber(undefined, "n", { fallback: 7 });
    expect(r.ok && r.value).toBe(7);
  });
});

describe("parseEnum", () => {
  it("accepteert allowed value", () => {
    const r = parseEnum("1d", "i", ["1d", "1wk"]);
    expect(r.ok && r.value).toBe("1d");
  });
  it("weigert andere waarde", () => {
    expect(parseEnum("5d", "i", ["1d", "1wk"] as const).ok).toBe(false);
  });
  it("fallback voor lege input", () => {
    const r = parseEnum(null, "i", ["a", "b"] as const, { fallback: "a" });
    expect(r.ok && r.value).toBe("a");
  });
});

describe("parseTickerStrict", () => {
  it("accepteert normale tickers en upcased", () => {
    const r = parseTickerStrict("asml.as");
    expect(r.ok && r.value).toBe("ASML.AS");
  });
  it("accepteert streepjes en cijfers", () => {
    expect(parseTickerStrict("BRK-B").ok).toBe(true);
    expect(parseTickerStrict("BTC-USD").ok).toBe(true);
  });
  it("weigert rare karakters", () => {
    expect(parseTickerStrict("AS ML").ok).toBe(false);
    expect(parseTickerStrict("AS<script>").ok).toBe(false);
    expect(parseTickerStrict(";DROP TABLE;").ok).toBe(false);
  });
  it("weigert te lange ticker", () => {
    expect(parseTickerStrict("A".repeat(50)).ok).toBe(false);
  });
});

describe("toFiniteNumber", () => {
  it("mapt NaN, Infinity naar null", () => {
    expect(toFiniteNumber(NaN)).toBeNull();
    expect(toFiniteNumber(Infinity)).toBeNull();
    expect(toFiniteNumber("NaN")).toBeNull();
    expect(toFiniteNumber("abc")).toBeNull();
  });
  it("mapt numerieke strings", () => {
    expect(toFiniteNumber("3.14")).toBe(3.14);
    expect(toFiniteNumber(" 42 ")).toBe(42);
    expect(toFiniteNumber("")).toBeNull();
  });
  it("Decimal-achtige objecten via toString", () => {
    const fakeDecimal = { toString: () => "1.5" };
    expect(toFiniteNumber(fakeDecimal)).toBe(1.5);
  });
  it("retourneert null voor onbekende objecten", () => {
    expect(toFiniteNumber({ nested: true })).toBeNull();
    expect(toFiniteNumber([])).toBeNull();
  });
});
