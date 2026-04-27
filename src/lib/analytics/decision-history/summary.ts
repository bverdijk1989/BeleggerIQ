import type {
  DecisionHistorySummary,
  DecisionRecord,
  DecisionStatus,
} from "./types";

/**
 * Decision History summary — pure aggregator boven op een lijst
 * `DecisionRecord`. Geen I/O, geen externe state.
 *
 * Strategie:
 *  1. Tel statussen in `bucketCounts` (alle 4 keys altijd aanwezig).
 *  2. Pak de 3 meest recente records (gesorteerd op `suggestedAt` desc)
 *     voor de dashboard-preview.
 *  3. Tel `actionableCount` — records die `SUGGESTED` zijn én niet
 *     verlopen (`expiresAt > now`). Dit getal stuurt de "Markeer als
 *     gedaan / genegeerd"-knoppen aan in de UI.
 *  4. Bouw een compacte NL-headline die de UI direct kan tonen.
 *
 * Identieke input → identieke output.
 */

const ZERO_BUCKETS: Record<DecisionStatus, number> = {
  SUGGESTED: 0,
  MARKED_DONE: 0,
  IGNORED: 0,
  EXPIRED: 0,
};

export interface SummarizeDecisionHistoryInput {
  records: DecisionRecord[];
  /** Override `now` voor deterministische tests. Default = system time. */
  now?: string;
  /** Default 3. */
  recentLimit?: number;
}

export function summarizeDecisionHistory(
  input: SummarizeDecisionHistoryInput,
): DecisionHistorySummary {
  const recentLimit = input.recentLimit ?? 3;
  const nowMs = input.now ? Date.parse(input.now) : Date.now();

  const bucketCounts = { ...ZERO_BUCKETS };
  let actionableCount = 0;
  for (const r of input.records) {
    bucketCounts[r.status] += 1;
    if (
      r.status === "SUGGESTED" &&
      Date.parse(r.expiresAt) > nowMs
    ) {
      actionableCount += 1;
    }
  }

  const recent = [...input.records]
    .sort(compareBySuggestedDesc)
    .slice(0, recentLimit);

  const total = input.records.length;
  const headline = buildHeadline({
    total,
    actionableCount,
    bucketCounts,
  });

  return {
    total,
    bucketCounts,
    recent,
    actionableCount,
    headline,
  };
}

function compareBySuggestedDesc(
  a: DecisionRecord,
  b: DecisionRecord,
): number {
  const ta = Date.parse(a.suggestedAt);
  const tb = Date.parse(b.suggestedAt);
  if (tb !== ta) return tb - ta;
  return a.id.localeCompare(b.id);
}

interface HeadlineArgs {
  total: number;
  actionableCount: number;
  bucketCounts: Record<DecisionStatus, number>;
}

function buildHeadline(args: HeadlineArgs): string {
  if (args.total === 0) {
    return "Nog geen adviezen vastgelegd — zodra de cockpit acties voorstelt, verschijnen ze hier.";
  }
  const parts: string[] = [];
  if (args.actionableCount > 0) {
    parts.push(
      `${args.actionableCount} actief advies${args.actionableCount === 1 ? "" : "en"}`,
    );
  }
  if (args.bucketCounts.MARKED_DONE > 0) {
    parts.push(`${args.bucketCounts.MARKED_DONE} uitgevoerd`);
  }
  if (args.bucketCounts.IGNORED > 0) {
    parts.push(`${args.bucketCounts.IGNORED} genegeerd`);
  }
  if (args.bucketCounts.EXPIRED > 0) {
    parts.push(`${args.bucketCounts.EXPIRED} verlopen`);
  }
  if (parts.length === 0) {
    return `${args.total} advies${args.total === 1 ? "" : "en"} in de geschiedenis.`;
  }
  return parts.join(" · ");
}
