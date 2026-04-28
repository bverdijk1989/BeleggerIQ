import type { TransactionRow } from "@/lib/data";
import { cn } from "@/lib/utils";

const TYPE_TONE: Record<TransactionRow["type"], string> = {
  BUY: "text-primary",
  SELL: "text-success",
  DIVIDEND: "text-success",
  INTEREST: "text-muted-foreground",
  FEE: "text-warning",
  TAX: "text-warning",
  CASH: "text-muted-foreground",
  FX: "text-muted-foreground",
  ADJUSTMENT: "text-muted-foreground",
};

interface TransactionsTableProps {
  rows: TransactionRow[];
}

export function TransactionsTable({ rows }: TransactionsTableProps) {
  return (
    <div className="overflow-hidden rounded-md border border-border/60">
      <div className="max-h-[640px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-surface-elevated text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Datum</th>
              <th className="px-3 py-2 text-left">Type</th>
              <th className="px-3 py-2 text-left">Product</th>
              <th className="px-3 py-2 text-left">Ticker / ISIN</th>
              <th className="px-3 py-2 text-right">Aantal</th>
              <th className="px-3 py-2 text-right">Prijs</th>
              <th className="px-3 py-2 text-right">Fee</th>
              <th className="px-3 py-2 text-right">Bedrag</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="border-t border-border/40 hover:bg-surface-elevated/40"
              >
                <td className="px-3 py-2 tabular-nums text-muted-foreground">
                  {row.executedAt.toISOString().slice(0, 10)}
                </td>
                <td
                  className={cn(
                    "px-3 py-2 font-medium",
                    TYPE_TONE[row.type] ?? "text-foreground",
                  )}
                >
                  {row.type}
                </td>
                <td
                  className="max-w-[260px] truncate px-3 py-2 text-foreground"
                  title={row.name ?? undefined}
                >
                  {row.name ?? "—"}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {row.ticker ?? row.isin ?? "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {row.quantity ?? "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {row.price !== null
                    ? row.price.toFixed(2)
                    : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                  {row.fee !== null ? row.fee.toFixed(2) : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {row.signedAmount !== null ? (
                    <>
                      <span
                        className={cn(
                          row.signedAmount < 0
                            ? "text-warning"
                            : "text-success",
                        )}
                      >
                        {row.signedAmount.toFixed(2)}
                      </span>{" "}
                      <span className="text-xs text-muted-foreground">
                        {row.currency}
                      </span>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
