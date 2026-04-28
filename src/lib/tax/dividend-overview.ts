/**
 * Dividend-withholding-overview.
 *
 * Aggregeert DIVIDEND/TAX-rijen uit de transactie-historie naar
 * (year, country, currency)-buckets:
 *
 *   - **gross**       totaal bruto-dividend (DIVIDEND-rijen, signedAmount > 0)
 *   - **withheld**    totaal bronbelasting (TAX-rijen gekoppeld aan
 *                     dezelfde ISIN en datum, bedrag absolut)
 *   - **reclaimable** theoretisch verrekenbaar/terugvorderbaar bedrag
 *                     o.b.v. NL-verdragen — zie `withholding.ts`.
 *
 * Koppeling DIVIDEND ↔ TAX: same-day + same-ISIN heuristic. DEGIRO levert
 * 'em typisch op dezelfde dag in twee aparte rijen. Wanneer er voor een
 * dividend geen matchende tax-rij is, gaan we ervan uit dat 'er niets
 * is ingehouden (bv. UK-bron of Ierse ETF-distributies).
 *
 * Pure functie — geen Prisma. Caller drukt rijen door, krijgt
 * year-buckets terug die direct in de UI of CSV-export landen.
 */

import { resolveCountry } from "./country";
import { reclaimableAmount, withholdingRule } from "./withholding";

export interface DividendInputRow {
  id: string;
  type: "DIVIDEND" | "TAX";
  isin: string | null;
  ticker: string | null;
  signedAmount: number | null;
  currency: string;
  executedAt: Date;
}

export interface CountryBucket {
  country: string;
  countryCode: string | null;
  /** Verzameld over alle rijen in dit jaar voor dit land. */
  gross: number;
  withheld: number;
  /** Theoretisch terug te vragen — zie `reclaimableAmount`. */
  reclaimable: number;
  /** Aantal dividend-events. */
  events: number;
  currency: string;
  /** Standaard-tarieven uit verdragstabel — informatief, niet contractueel. */
  defaultRate: number;
  treatyRate: number;
  note?: string;
}

export interface DividendYearBucket {
  year: number;
  byCountry: CountryBucket[];
  totals: {
    gross: number;
    withheld: number;
    reclaimable: number;
    /** Currency van de aggregatie — null wanneer mixed. */
    currency: string | null;
  };
}

export interface OverviewInput {
  rows: DividendInputRow[];
}

/** key = `${year}|${countryCode || "??"}|${currency}` */
function bucketKey(year: number, countryCode: string | null, currency: string): string {
  return `${year}|${countryCode ?? "??"}|${currency}`;
}

export function buildDividendOverview(
  input: OverviewInput,
): DividendYearBucket[] {
  // 1) Pair DIVIDEND-rijen met TAX-rijen op (date|isin).
  const taxIndex = new Map<string, DividendInputRow[]>();
  for (const row of input.rows) {
    if (row.type !== "TAX") continue;
    const key = `${row.executedAt.toISOString().slice(0, 10)}|${row.isin ?? row.ticker ?? "?"}`;
    const arr = taxIndex.get(key) ?? [];
    arr.push(row);
    taxIndex.set(key, arr);
  }

  // 2) Loop dividends, vind matching tax (same day + same ISIN/ticker).
  const buckets = new Map<string, CountryBucket & { year: number }>();

  for (const row of input.rows) {
    if (row.type !== "DIVIDEND") continue;
    const gross = row.signedAmount ?? 0;
    if (gross <= 0) continue;
    const year = row.executedAt.getUTCFullYear();
    const cc = resolveCountry({ isin: row.isin, ticker: row.ticker });

    const taxKey = `${row.executedAt.toISOString().slice(0, 10)}|${row.isin ?? row.ticker ?? "?"}`;
    const taxRows = taxIndex.get(taxKey) ?? [];
    const withheld = taxRows.reduce(
      (sum, t) => sum + Math.abs(t.signedAmount ?? 0),
      0,
    );

    const rule = withholdingRule(cc);
    const reclaim = reclaimableAmount(cc, gross, withheld);

    const key = bucketKey(year, cc, row.currency);
    const existing = buckets.get(key);
    if (existing) {
      existing.gross += gross;
      existing.withheld += withheld;
      existing.reclaimable += reclaim;
      existing.events += 1;
    } else {
      buckets.set(key, {
        year,
        country: countryNameOrUnknown(cc),
        countryCode: cc,
        gross,
        withheld,
        reclaimable: reclaim,
        events: 1,
        currency: row.currency,
        defaultRate: rule.defaultRate,
        treatyRate: rule.treatyRate,
        note: rule.note,
      });
    }
  }

  // 3) Group per year.
  const yearMap = new Map<number, DividendYearBucket>();
  for (const b of buckets.values()) {
    let yb = yearMap.get(b.year);
    if (!yb) {
      yb = {
        year: b.year,
        byCountry: [],
        totals: { gross: 0, withheld: 0, reclaimable: 0, currency: null },
      };
      yearMap.set(b.year, yb);
    }
    yb.byCountry.push({
      country: b.country,
      countryCode: b.countryCode,
      gross: b.gross,
      withheld: b.withheld,
      reclaimable: b.reclaimable,
      events: b.events,
      currency: b.currency,
      defaultRate: b.defaultRate,
      treatyRate: b.treatyRate,
      note: b.note,
    });
  }

  // 4) Sort + totals (per-year totals zijn alleen valide bij single-currency
  //    binnen het jaar; bij mixed currencies geven we de totals als 0/null
  //    en laat de UI 'em uit `byCountry` opbouwen).
  const out: DividendYearBucket[] = [];
  for (const yb of yearMap.values()) {
    yb.byCountry.sort((a, b) => b.gross - a.gross);
    const currencies = new Set(yb.byCountry.map((c) => c.currency));
    if (currencies.size === 1) {
      yb.totals = {
        gross: yb.byCountry.reduce((s, c) => s + c.gross, 0),
        withheld: yb.byCountry.reduce((s, c) => s + c.withheld, 0),
        reclaimable: yb.byCountry.reduce((s, c) => s + c.reclaimable, 0),
        currency: [...currencies][0] ?? null,
      };
    } else {
      yb.totals = { gross: 0, withheld: 0, reclaimable: 0, currency: null };
    }
    out.push(yb);
  }
  out.sort((a, b) => b.year - a.year);
  return out;
}

function countryNameOrUnknown(code: string | null): string {
  if (!code) return "Onbekend";
  const map: Record<string, string> = {
    NL: "Nederland", US: "Verenigde Staten", DE: "Duitsland", FR: "Frankrijk",
    GB: "Verenigd Koninkrijk", CH: "Zwitserland", BE: "België", IT: "Italië",
    ES: "Spanje", CA: "Canada", AU: "Australië", JP: "Japan", HK: "Hong Kong",
    IE: "Ierland", LU: "Luxemburg", SE: "Zweden", NO: "Noorwegen", DK: "Denemarken",
    FI: "Finland", PT: "Portugal",
  };
  return map[code.toUpperCase()] ?? code.toUpperCase();
}
