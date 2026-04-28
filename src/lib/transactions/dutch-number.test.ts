import { describe, expect, it } from "vitest";

import { parseDutchNumber } from "./dutch-number";

function ok(input: string, expected: number) {
  const r = parseDutchNumber(input);
  if (!r.ok) throw new Error(`expected ok for ${input}, got ${r.reason}`);
  expect(r.value).toBeCloseTo(expected, 6);
}

function fail(input: string | null | undefined) {
  const r = parseDutchNumber(input);
  expect(r.ok).toBe(false);
}

describe("parseDutchNumber — pure cijfers", () => {
  it("'1000' → 1000", () => ok("1000", 1000));
  it("'0' → 0", () => ok("0", 0));
  it("'-42' → -42", () => ok("-42", -42));
  it("'+42' → 42", () => ok("+42", 42));
});

describe("parseDutchNumber — komma-decimaal (NL)", () => {
  it("'1,23' → 1.23", () => ok("1,23", 1.23));
  it("'0,5' → 0.5", () => ok("0,5", 0.5));
  it("'-1,99' → -1.99", () => ok("-1,99", -1.99));
});

describe("parseDutchNumber — punt-duizendtallen (NL)", () => {
  it("'1.000' → 1000", () => ok("1.000", 1000));
  it("'10.000' → 10000", () => ok("10.000", 10000));
  it("'1.234.567' → 1234567", () => ok("1.234.567", 1234567));
});

describe("parseDutchNumber — gecombineerd (NL: 1.234,56)", () => {
  it("'1.234,56' → 1234.56", () => ok("1.234,56", 1234.56));
  it("'12.345,67' → 12345.67", () => ok("12.345,67", 12345.67));
  it("'1.000.000,00' → 1000000", () => ok("1.000.000,00", 1000000));
});

describe("parseDutchNumber — Engelse stijl (EN: 1,234.56)", () => {
  it("'1,234.56' → 1234.56", () => ok("1,234.56", 1234.56));
  it("'1,234,567.89' → 1234567.89", () => ok("1,234,567.89", 1234567.89));
});

describe("parseDutchNumber — punt als decimaal (1.5)", () => {
  it("'1.5' → 1.5 (geen duizendtal omdat fractie ≠ 3 cijfers)", () => ok("1.5", 1.5));
  it("'1.23' → 1.23", () => ok("1.23", 1.23));
  it("'0.07' → 0.07", () => ok("0.07", 0.07));
});

describe("parseDutchNumber — currency-prefix", () => {
  it("'€1.234,56' → 1234.56", () => ok("€1.234,56", 1234.56));
  it("'$ 99.99' → 99.99", () => ok("$ 99.99", 99.99));
});

describe("parseDutchNumber — whitespace + quoted", () => {
  it("'  1,5  ' → 1.5", () => ok("  1,5  ", 1.5));
  it("'\"1.234,56\"' → 1234.56 (quoted CSV cell)", () => ok('"1.234,56"', 1234.56));
});

describe("parseDutchNumber — fail-safe", () => {
  it("'' → fail (empty)", () => fail(""));
  it("null → fail", () => fail(null));
  it("undefined → fail", () => fail(undefined));
  it("'abc' → fail", () => fail("abc"));
  // "1.234.5" is ambigu (groepen van 3 + groep van 1), niet veilig te raden
  it("'1.234.5' → fail (ambigu thousands)", () => fail("1.234.5"));
});
