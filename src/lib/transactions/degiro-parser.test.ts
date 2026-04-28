import { describe, expect, it } from "vitest";

import { parseDegiroCsv } from "./degiro-parser";

const HEADER =
  'Datum,Tijd,Valutadatum,Product,ISIN,Omschrijving,FX,Mutatie,"",Saldo,"",Order Id';

function csv(...rows: string[]): string {
  return [HEADER, ...rows].join("\n");
}

describe("parseDegiroCsv — Buy", () => {
  it("Koop 5 @ 600,00 EUR → BUY met qty/price uit omschrijving en NL-bedrag", () => {
    const r = parseDegiroCsv(
      csv(
        '30-12-2025,12:34,30-12-2025,ASML,NL0010273215,"Koop 5 @ 600,00 EUR",,EUR,"-3.000,00",EUR,"-1.765,44",abc-123',
      ),
    );
    expect(r.errors).toEqual([]);
    expect(r.transactions).toHaveLength(1);
    const tx = r.transactions[0]!;
    expect(tx.type).toBe("BUY");
    expect(tx.quantity).toBe(5);
    expect(tx.price).toBe(600);
    expect(tx.signedAmount).toBe(-3000);
    expect(tx.currency).toBe("EUR");
    expect(tx.isin).toBe("NL0010273215");
    expect(tx.metadata.orderId).toBe("abc-123");
  });
});

describe("parseDegiroCsv — Sell", () => {
  it("Verkoop 10 @ 145,50 USD → SELL met USD-currency en + bedrag", () => {
    const r = parseDegiroCsv(
      csv(
        '15-06-2026,10:00,15-06-2026,APPLE INC,US0378331005,"Verkoop 10 @ 145,50 USD",,USD,"1.455,00",USD,"5.000,00",order-9',
      ),
    );
    expect(r.errors).toEqual([]);
    const tx = r.transactions[0]!;
    expect(tx.type).toBe("SELL");
    expect(tx.quantity).toBe(10);
    expect(tx.price).toBe(145.5);
    expect(tx.currency).toBe("USD");
    expect(tx.signedAmount).toBe(1455);
  });
});

describe("parseDegiroCsv — Fees", () => {
  it("Transactiekosten met klein bedrag → FEE met fee = abs(signedAmount)", () => {
    const r = parseDegiroCsv(
      csv(
        '30-12-2025,12:34,30-12-2025,ASML,NL0010273215,DEGIRO transactiekosten,,EUR,"-2,00",EUR,"1.234,56",abc-123',
      ),
    );
    expect(r.errors).toEqual([]);
    const tx = r.transactions[0]!;
    expect(tx.type).toBe("FEE");
    expect(tx.fee).toBe(2);
    expect(tx.signedAmount).toBe(-2);
  });
});

describe("parseDegiroCsv — Dividend + Tax", () => {
  it("Dividend zonder belasting → DIVIDEND", () => {
    const r = parseDegiroCsv(
      csv(
        '02-01-2026,09:00,02-01-2026,APPLE INC. - COMMON ST,US0378331005,Dividend,,USD,"12,34",USD,"50,00",',
      ),
    );
    expect(r.errors).toEqual([]);
    const tx = r.transactions[0]!;
    expect(tx.type).toBe("DIVIDEND");
    expect(tx.signedAmount).toBe(12.34);
    expect(tx.currency).toBe("USD");
  });

  it("Dividendbelasting → TAX", () => {
    const r = parseDegiroCsv(
      csv(
        '02-01-2026,09:00,02-01-2026,APPLE INC,US0378331005,Dividendbelasting,,USD,"-1,85",USD,"48,15",',
      ),
    );
    expect(r.errors).toEqual([]);
    expect(r.transactions[0]!.type).toBe("TAX");
  });
});

describe("parseDegiroCsv — Cash & FX", () => {
  it("iDEAL storting → CASH", () => {
    const r = parseDegiroCsv(
      csv(
        '01-01-2026,08:00,01-01-2026,,,iDEAL Deposit,,EUR,"5.000,00",EUR,"5.000,00",',
      ),
    );
    expect(r.errors).toEqual([]);
    expect(r.transactions[0]!.type).toBe("CASH");
    expect(r.transactions[0]!.signedAmount).toBe(5000);
  });

  it("Valuta credit → FX", () => {
    const r = parseDegiroCsv(
      csv(
        '03-01-2026,09:00,03-01-2026,,,Valuta Credit,,USD,"100,00",USD,"100,00",',
      ),
    );
    expect(r.errors).toEqual([]);
    expect(r.transactions[0]!.type).toBe("FX");
  });
});

describe("parseDegiroCsv — Mixed currency rows", () => {
  it("3 rijen in EUR + USD samen → 3 valid txs", () => {
    const r = parseDegiroCsv(
      csv(
        '01-01-2026,08:00,01-01-2026,,,iDEAL Deposit,,EUR,"5.000,00",EUR,"5.000,00",',
        '15-06-2026,10:00,15-06-2026,APPLE INC,US0378331005,"Koop 10 @ 150,00 USD",,USD,"-1.500,00",USD,"-1.500,00",ord-1',
        '02-09-2026,09:00,02-09-2026,APPLE INC,US0378331005,Dividend,,USD,"12,34",USD,"-1.487,66",',
      ),
    );
    expect(r.errors).toEqual([]);
    expect(r.transactions).toHaveLength(3);
    const types = r.transactions.map((t) => t.type);
    expect(types).toEqual(["CASH", "BUY", "DIVIDEND"]);
    const ccys = r.transactions.map((t) => t.currency);
    expect(ccys).toEqual(["EUR", "USD", "USD"]);
  });
});

describe("parseDegiroCsv — fail-safe", () => {
  it("Onbekende omschrijving zonder bedrag → error met reden", () => {
    const r = parseDegiroCsv(
      csv(
        "30-12-2025,12:34,30-12-2025,XYZ,XX0000000000,Iets onverwacht,,EUR,,EUR,,",
      ),
    );
    expect(r.transactions).toHaveLength(0);
    expect(r.errors.length).toBe(1);
    expect(r.errors[0]!.reason).toMatch(/unrecognized_description/);
  });

  it("Ongeldige datum → error", () => {
    const r = parseDegiroCsv(
      csv(
        'not-a-date,12:34,30-12-2025,ASML,NL0010273215,"Koop 5 @ 600,00 EUR",,EUR,"-3.000,00",EUR,"-1.765,44",abc',
      ),
    );
    expect(r.errors[0]!.reason).toMatch(/invalid_date/);
  });

  it("CSV zonder DEGIRO-headers → not_a_degiro_csv error", () => {
    const r = parseDegiroCsv("foo,bar,baz\n1,2,3\n");
    expect(r.errors[0]!.reason).toMatch(/not_a_degiro_csv/);
  });

  it("Ongeldig bedrag (1.234.5) → invalid_amount", () => {
    const r = parseDegiroCsv(
      csv(
        '30-12-2025,12:34,30-12-2025,ASML,NL0010273215,DEGIRO transactiekosten,,EUR,"1.234.5",EUR,"x",abc',
      ),
    );
    expect(r.errors[0]!.reason).toMatch(/invalid_amount/);
  });

  it("Lege rij wordt overgeslagen zonder error", () => {
    const r = parseDegiroCsv(csv(",,,,,,,,,,,"));
    expect(r.errors).toEqual([]);
    expect(r.transactions).toHaveLength(0);
  });
});

describe("parseDegiroCsv — externalId dedup", () => {
  it("BUY + zelfde-order-id-FEE krijgen verschillende externalIds (type-suffix)", () => {
    const r = parseDegiroCsv(
      csv(
        '30-12-2025,12:34,30-12-2025,ASML,NL0010273215,"Koop 5 @ 600,00 EUR",,EUR,"-3.000,00",EUR,"-1.765,44",abc-123',
        '30-12-2025,12:34,30-12-2025,ASML,NL0010273215,DEGIRO transactiekosten,,EUR,"-2,00",EUR,"1.234,56",abc-123',
      ),
    );
    expect(r.errors).toEqual([]);
    const ids = r.transactions.map((t) => t.externalId);
    expect(new Set(ids).size).toBe(2);
  });
});
