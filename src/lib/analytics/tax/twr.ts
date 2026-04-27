import type { PortfolioSnapshotRow } from "@/lib/data";

/**
 * Time-Weighted Return (TWR) — bruto-rendement over een trailing
 * 12-maand venster, gecorrigeerd voor cashflows (storting/onttrekking).
 *
 * Pure functie. Faal-safe bij te weinig snapshots.
 *
 * Methode:
 *   - Sorteer snapshots oplopend.
 *   - Pak het venster `[asOf - 12m, asOf]`.
 *   - Voor elke periode `t→t+1`:
 *       cashFlow_t = totalCost_{t+1} - totalCost_t
 *       holdingPeriodReturn_t = (V_{t+1} - cashFlow_t - V_t) / V_t
 *   - TWR = ∏(1 + r_t) − 1
 *
 * Geeft `null` terug wanneer er minder dan 2 bruikbare snapshots in
 * het venster zijn — caller moet dan terugvallen op een andere proxy
 * (bv. unrealized PnL).
 */

export interface ComputeTwrYearInput {
  snapshots: PortfolioSnapshotRow[];
  /** Peilmoment (default = nu). */
  asOf?: Date;
  /** Vensterbreedte in maanden (default 12). */
  windowMonths?: number;
}

export function computeTwrYear(
  input: ComputeTwrYearInput,
): number | null {
  const asOf = input.asOf ?? new Date();
  const windowMonths = input.windowMonths ?? 12;
  const start = new Date(asOf);
  start.setMonth(start.getMonth() - windowMonths);

  const valid = input.snapshots
    .filter(
      (s) =>
        Number.isFinite(s.totalValue) &&
        s.totalValue > 0 &&
        Number.isFinite(s.totalCost),
    )
    .sort((a, b) => (a.capturedAt < b.capturedAt ? -1 : 1));

  // Filter op venster.
  const window = valid.filter((s) => {
    const t = Date.parse(s.capturedAt);
    return Number.isFinite(t) && t >= start.getTime() && t <= asOf.getTime();
  });

  if (window.length < 2) return null;

  // Bouw chained holding-period returns.
  let compound = 1;
  let usefulSegments = 0;
  for (let i = 1; i < window.length; i++) {
    const prev = window[i - 1]!;
    const curr = window[i]!;
    if (prev.totalValue <= 0) continue;
    const cashFlow = curr.totalCost - prev.totalCost;
    const periodReturn =
      (curr.totalValue - cashFlow - prev.totalValue) / prev.totalValue;
    if (!Number.isFinite(periodReturn)) continue;
    // Floor 1+r op 0 om wipe-outs te clampen.
    compound *= Math.max(0, 1 + periodReturn);
    usefulSegments += 1;
  }
  if (usefulSegments === 0) return null;
  return compound - 1;
}
