import type { EnrichedWatchlistRow } from "../load-watchlist";
import { WatchlistRowActions } from "./watchlist-row-actions";

interface Props {
  rows: EnrichedWatchlistRow[];
}

function fmtPrice(value: number | null | undefined, ccy?: string | null): string {
  if (value === null || value === undefined) return "—";
  return `${value.toLocaleString("nl-NL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}${ccy ? ` ${ccy}` : ""}`;
}

function fmtPct(fraction: number | null | undefined): string {
  if (fraction === null || fraction === undefined) return "—";
  const sign = fraction >= 0 ? "+" : "";
  return `${sign}${(fraction * 100).toFixed(1)}%`;
}

function fmtComposite(score: number | null | undefined): string {
  if (score === null || score === undefined) return "—";
  return (score * 100).toFixed(0);
}

function fmtDate(iso: string): string {
  return iso.slice(0, 10);
}

export function WatchlistTable({ rows }: Props) {
  return (
    <div className="overflow-hidden rounded-md border border-border/60">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-elevated text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Ticker</th>
              <th className="px-3 py-2 text-left">Naam</th>
              <th className="px-3 py-2 text-right">Quote</th>
              <th className="px-3 py-2 text-right">Δ dag</th>
              <th className="px-3 py-2 text-right">Score</th>
              <th className="px-3 py-2 text-left">Rationale</th>
              <th className="px-3 py-2 text-right">Toegevoegd</th>
              <th className="px-3 py-2 text-right">Acties</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ item, quote, factor, rationale }) => (
              <tr
                key={item.id}
                className="border-t border-border/40 align-top hover:bg-surface-elevated/40"
              >
                <td className="px-3 py-2 font-medium tabular-nums">
                  {item.ticker}
                </td>
                <td className="max-w-[220px] truncate px-3 py-2 text-muted-foreground">
                  {item.name ?? "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {fmtPrice(quote?.price ?? null, quote?.currency)}
                </td>
                <td
                  className={`px-3 py-2 text-right tabular-nums ${
                    quote?.changePct !== undefined && quote.changePct !== null
                      ? quote.changePct >= 0
                        ? "text-success"
                        : "text-destructive"
                      : "text-muted-foreground"
                  }`}
                >
                  {fmtPct(quote?.changePct)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {fmtComposite(factor?.composite)}
                </td>
                <td className="max-w-[300px] px-3 py-2 text-xs text-muted-foreground">
                  {rationale ?? <span className="opacity-60">Geen signaal</span>}
                </td>
                <td className="px-3 py-2 text-right text-xs text-muted-foreground tabular-nums">
                  {fmtDate(item.addedAt)}
                </td>
                <td className="px-3 py-2 text-right">
                  <WatchlistRowActions
                    itemId={item.id}
                    ticker={item.ticker}
                    currentTarget={item.targetPrice ?? null}
                    currentTargetHigh={item.targetPriceHigh ?? null}
                    currency={quote?.currency ?? null}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
