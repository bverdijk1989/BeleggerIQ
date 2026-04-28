import { describe, expect, it } from "vitest";

import { TAX_DISCLAIMER_BODY } from "./disclaimer";
import { buildTaxCsv } from "./export-csv";

describe("buildTaxCsv", () => {
  const baseInput = {
    generatedAt: new Date("2026-04-28T10:00:00Z"),
    baseCurrency: "EUR",
    valuations: [
      {
        peilYear: 2026,
        asOf: "2026-01-01T00:00:00.000Z",
        value: 250_000,
        source: "snapshot-exact" as const,
        daysFromBoundary: 0,
      },
    ],
    dividends: [
      {
        year: 2025,
        byCountry: [
          {
            country: "Verenigde Staten",
            countryCode: "US",
            gross: 100,
            withheld: 15,
            reclaimable: 0,
            events: 4,
            currency: "USD",
            defaultRate: 0.30,
            treatyRate: 0.15,
            note: "Verlaagd via W-8BEN",
          },
        ],
        totals: {
          gross: 100,
          withheld: 15,
          reclaimable: 0,
          currency: "USD",
        },
      },
    ],
  };

  it("bevat de disclaimer letterlijk", () => {
    const csv = buildTaxCsv(baseInput);
    expect(csv).toContain(TAX_DISCLAIMER_BODY);
  });

  it("escaped cell met komma's wordt quoted", () => {
    const csv = buildTaxCsv({
      ...baseInput,
      dividends: [
        {
          ...baseInput.dividends[0]!,
          byCountry: [
            {
              ...baseInput.dividends[0]!.byCountry[0]!,
              note: "Comma, in note",
            },
          ],
        },
      ],
    });
    expect(csv).toContain('"Comma, in note"');
  });

  it("rijen voor peildatum + dividenden zijn aanwezig", () => {
    const csv = buildTaxCsv(baseInput);
    expect(csv).toContain("Peildatum-waarden");
    expect(csv).toContain("250000.00");
    expect(csv).toContain("Verenigde Staten");
    expect(csv).toContain("TOTAAL");
  });
});
