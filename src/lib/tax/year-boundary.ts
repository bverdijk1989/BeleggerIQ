/**
 * Year-boundary value engine.
 *
 * Voor box 3 in Nederland is **1 januari 00:00** de peildatum: de
 * waarde van je portefeuille op die datum is je grondslag. Deze module
 * leidt 'em af uit de bestaande `PortfolioSnapshot`-tijdreeks zonder
 * extra data-collectie te vereisen.
 *
 * Bewuste keuzes:
 *
 *   - **Window: ± 14 dagen rond 1 januari.** Een snapshot van 31-12 is
 *     net zo bruikbaar als 1-1; een snapshot van eind-november niet.
 *     We pakken de snapshot dichtst bij 1-1 binnen het window.
 *   - **Closest-wins.** Als er zowel 28-12 als 03-01 een snapshot is,
 *     kiezen we degene met de kleinste afstand (in dagen) tot 1-1.
 *   - **Manual override.** De caller kan een `manualValuations` map
 *     meegeven die snapshots overschrijft — gebruikt door de UI flow
 *     "geen snapshot, vul handmatig" zodat de gebruiker een waarde
 *     invoert die we apart persisteren.
 *   - **Geen extrapolatie.** Als er niets binnen het window is,
 *     retourneren we `{ source: "missing" }` — het is dan aan de UI om
 *     manual entry te vragen i.p.v. te raden.
 *
 * Terminologie:
 *   - `peilYear` = belastingjaar; de Box-3 grondslag voor jaar Y wordt
 *     gemeten op 1 jan Y. Bv. aangifte 2025 → peildatum 1 jan 2025.
 */

const WINDOW_DAYS = 14;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface SnapshotInput {
  capturedAt: Date;
  totalValue: number;
  /** Optioneel — sommige snapshots willen we voorkeur geven (bv. handmatig). */
  source?: string;
}

export interface ValuationOutcome {
  peilYear: number;
  /** ISO datum van de gekozen snapshot (of de manual-entry datum). */
  asOf: string | null;
  /** EUR-waarde op de peildatum, of null als unresolved. */
  value: number | null;
  /** Hoe de waarde tot stand kwam. */
  source:
    | "snapshot-exact"   // exacte 1-jan-snapshot
    | "snapshot-near"    // dichtsbijzijnde binnen window
    | "manual"           // user heeft 'em ingevuld
    | "missing";         // niets gevonden — UI toont input-flow
  /** Aantal dagen tussen `asOf` en 1-1 (0 voor exact). */
  daysFromBoundary: number | null;
}

export interface ResolveInput {
  /** Lijst van peil-jaren die we willen oplossen (bv. [2024, 2025]). */
  peilYears: number[];
  /** Beschikbare PortfolioSnapshots — willekeurige volgorde mag. */
  snapshots: SnapshotInput[];
  /** Per-jaar handmatig ingevoerde waarden (override snapshot). */
  manualValuations?: Map<number, { value: number; asOf: Date }>;
}

function jan1(year: number): Date {
  return new Date(Date.UTC(year, 0, 1, 0, 0, 0));
}

function daysBetween(a: Date, b: Date): number {
  return Math.abs(Math.round((a.getTime() - b.getTime()) / MS_PER_DAY));
}

export function resolveYearBoundaries(input: ResolveInput): ValuationOutcome[] {
  const out: ValuationOutcome[] = [];
  for (const year of input.peilYears) {
    const target = jan1(year);
    const manual = input.manualValuations?.get(year);
    if (manual) {
      out.push({
        peilYear: year,
        asOf: manual.asOf.toISOString(),
        value: manual.value,
        source: "manual",
        daysFromBoundary: daysBetween(target, manual.asOf),
      });
      continue;
    }

    // Filter snapshots binnen het window.
    let best: { snap: SnapshotInput; days: number } | null = null;
    for (const snap of input.snapshots) {
      const days = daysBetween(target, snap.capturedAt);
      if (days > WINDOW_DAYS) continue;
      if (!best || days < best.days) {
        best = { snap, days };
      }
    }

    if (!best) {
      out.push({
        peilYear: year,
        asOf: null,
        value: null,
        source: "missing",
        daysFromBoundary: null,
      });
      continue;
    }

    // "Exact" alleen wanneer de snapshot op DEZELFDE UTC-kalenderdag
    // valt als 1-januari (dus niet alleen "binnen 24 uur"). Anders
    // markeren we 'em als near-snapshot zodat de UI een waarschuwing
    // kan tonen dat de waarde niet exact op de peildatum gemeten is.
    const sameDay =
      best.snap.capturedAt.getUTCFullYear() === year &&
      best.snap.capturedAt.getUTCMonth() === 0 &&
      best.snap.capturedAt.getUTCDate() === 1;
    out.push({
      peilYear: year,
      asOf: best.snap.capturedAt.toISOString(),
      value: best.snap.totalValue,
      source: sameDay ? "snapshot-exact" : "snapshot-near",
      daysFromBoundary: best.days,
    });
  }
  return out;
}

/**
 * Convenience: leid de set van peil-jaren af uit een transactiehistorie.
 * Voor jaar Y zijn we alleen ge&iuml;nteresseerd als er minstens 1
 * transactie was vóór 1-jan-Y (anders had je nog geen positie).
 *
 * We retourneren altijd ook het lopende kalenderjaar zodat de UI direct
 * een Jan-1 verwachting toont.
 */
export function deriveRelevantPeilYears(input: {
  earliestTxDate: Date | null;
  now: Date;
}): number[] {
  const currentYear = input.now.getUTCFullYear();
  if (!input.earliestTxDate) return [currentYear];
  const startYear = input.earliestTxDate.getUTCFullYear();
  // Eerste peildatum is 1-jan van het jaar NA de eerste transactie.
  // Voorbeeld: eerste BUY 15-juni-2024 → eerste peildatum 1-1-2025.
  const firstPeil = startYear + 1;
  if (firstPeil > currentYear) return [currentYear];
  const years: number[] = [];
  for (let y = firstPeil; y <= currentYear; y++) years.push(y);
  return years;
}
