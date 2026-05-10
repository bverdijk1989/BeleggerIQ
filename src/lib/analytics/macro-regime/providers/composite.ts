/**
 * Composite-provider — leest eerst uit de DB-snapshot; vult ontbrekende
 * indicators aan met seed-data.
 *
 * Dat geeft de UI een complete tabel zonder dat productie-data verplicht
 * is, terwijl real data wel automatisch voorrang krijgt zodra die er is.
 */

import { SeedMacroProvider } from "./seed";
import { SnapshotMacroProvider } from "./snapshot";
import type {
  MacroDataProvider,
  MacroDataSnapshot,
  RawMacroIndicator,
} from "./types";

export class CompositeMacroProvider implements MacroDataProvider {
  readonly id = "composite" as const;
  private readonly snapshot = new SnapshotMacroProvider();
  private readonly seed = new SeedMacroProvider();

  async fetch(): Promise<MacroDataSnapshot> {
    const [snap, seed] = await Promise.all([
      this.snapshot.fetch(),
      this.seed.fetch(),
    ]);

    const seedByKey = new Map(seed.indicators.map((i) => [i.key, i]));
    const merged: RawMacroIndicator[] = [];
    for (const indicator of snap.indicators) {
      if (indicator.value === null) {
        const fallback = seedByKey.get(indicator.key);
        if (fallback) {
          merged.push({ ...fallback, source: `${fallback.source}+snapshot-empty` });
          continue;
        }
      }
      merged.push(indicator);
    }
    // Voor indicator-keys die helemaal niet in de snapshot voorkomen:
    const present = new Set(merged.map((i) => i.key));
    for (const seedInd of seed.indicators) {
      if (!present.has(seedInd.key)) merged.push(seedInd);
    }

    return {
      asOf: snap.asOf || seed.asOf,
      providerId: this.id,
      indicators: merged,
    };
  }
}
