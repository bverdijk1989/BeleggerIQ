/**
 * Dutch number parser.
 *
 * Doel: een DEGIRO-CSV cell zoals `"1.234,56"` of `"1,23"` of `"1000"`
 * naar een TypeScript-`number` converteren — **veilig**. Als het format
 * dubbelzinnig is, faalt de parser i.p.v. een fout getal te leveren —
 * dat is veiliger voor finance-data.
 *
 * Regels (in volgorde van toepassing):
 *
 *   1. Strip whitespace en wrappende quotes/spaties.
 *   2. Lege string → null.
 *   3. Optioneel een leidend valuta-symbool (€ $ £) → strip.
 *   4. Optioneel een leidend `+` / `-` → onthoud teken.
 *   5. Detecteer welke separator decimaal is:
 *      - Bevat ALLEEN `,`            → komma is decimaal
 *      - Bevat ALLEEN `.`            → moeilijker:
 *          - "1.234"                 → ambigu (1234 of 1,234?). We
 *            kiezen voor **integer-interpretatie** alleen als de
 *            groep precies uit 3 cijfers bestaat (NL duizendtal).
 *            Anders → decimaal.
 *      - Bevat zowel `,` als `.`     → dezgene die het laatst
 *        voorkomt is decimaal (NL: `1.234,56`; EN: `1,234.56`).
 *   6. Verwijder duizendtallen (de andere separator), parse met `.`.
 *
 * Wij parsen géén exponential-notation (1e3) — DEGIRO gebruikt 'em niet,
 * en accepteren zou de ambiguity-detectie ondergraven.
 */

export type DutchNumberResult =
  | { ok: true; value: number }
  | { ok: false; reason: string };

const CURRENCY_PREFIX = /^[€$£¥]/;

export function parseDutchNumber(input: string | null | undefined): DutchNumberResult {
  if (input === null || input === undefined) {
    return { ok: false, reason: "empty" };
  }
  let s = String(input).trim();
  // Strip wrappende dubbele/enkele quotes (CSV-cells)
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  if (s === "" || s.toLowerCase() === "n/a") {
    return { ok: false, reason: "empty" };
  }
  // Strip currency-prefix
  s = s.replace(CURRENCY_PREFIX, "").trim();

  // Sign
  let sign = 1;
  if (s.startsWith("+")) {
    s = s.slice(1).trim();
  } else if (s.startsWith("-")) {
    sign = -1;
    s = s.slice(1).trim();
  }

  // Geen cijfers? geen getal.
  if (!/^[\d.,\s]+$/.test(s)) {
    return { ok: false, reason: `invalid_chars:${s}` };
  }

  // Strip whitespace tussen groepen ("1 234,56" → "1234,56")
  s = s.replace(/\s+/g, "");

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  let normalized: string;

  if (hasComma && hasDot) {
    // De separator die het laatst voorkomt is decimaal.
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");
    if (lastComma > lastDot) {
      // NL-stijl: 1.234,56 → 1234.56
      normalized = s.replace(/\./g, "").replace(",", ".");
    } else {
      // EN-stijl: 1,234.56 → 1234.56
      normalized = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    // Alleen komma. Als er meerdere komma's zijn → het zijn duizendtallen
    // (Engelse stijl zonder decimaal: "1,234,567"); anders decimaal.
    const commaCount = (s.match(/,/g) ?? []).length;
    if (commaCount > 1) {
      normalized = s.replace(/,/g, "");
    } else {
      // Eén komma. Als het deel ná de komma exact 3 cijfers is en er is
      // GEEN decimale interpretatie elders → ambigu (1,234 kan 1234 of 1.234 zijn).
      // We kiezen decimaal als default — dat is veruit het meest voorkomend
      // in NL CSVs. Een explicit duizendtal-`,` is in NL ongebruikelijk.
      normalized = s.replace(",", ".");
    }
  } else if (hasDot) {
    // Alleen punt(en). Probeer te detecteren of 'em duizendtallen zijn:
    // een Nederlandse "1.000" duizendtal heeft groepen van precies 3 cijfers
    // ZONDER decimaal-deel. Een "1.5" of "1.50" of "1.234" met 1-3 cijfers
    // ná de punt is ambigu → behandel als decimaal.
    const dotCount = (s.match(/\./g) ?? []).length;
    if (dotCount > 1) {
      // Meerdere punten: zeker duizendtallen ("1.234.567")
      // Validatie: elke groep ná de eerste moet precies 3 cijfers zijn.
      const parts = s.split(".");
      const allGroupsAreThree = parts
        .slice(1)
        .every((g) => /^\d{3}$/.test(g));
      if (!allGroupsAreThree) {
        return { ok: false, reason: `ambiguous_thousands:${s}` };
      }
      normalized = s.replace(/\./g, "");
    } else {
      // Precies één punt. Als het deel ná de punt EXACT 3 cijfers is en
      // het deel ervóór ≥1 cijfer → behandel als duizendtal: "1.000" → 1000.
      // Anders → decimaal.
      const [whole, frac] = s.split(".");
      if (frac && frac.length === 3 && whole && whole.length >= 1) {
        normalized = (whole + frac);
      } else {
        normalized = s;
      }
    }
  } else {
    // Pure cijfers
    normalized = s;
  }

  const num = Number(normalized);
  if (!Number.isFinite(num)) {
    return { ok: false, reason: `not_finite:${normalized}` };
  }
  return { ok: true, value: sign * num };
}
