import Link from "next/link";
import type { Route } from "next";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { TxType } from "@/lib/transactions/types";

const TYPES: TxType[] = [
  "BUY",
  "SELL",
  "DIVIDEND",
  "INTEREST",
  "FEE",
  "TAX",
  "CASH",
  "FX",
];

interface TransactionFiltersProps {
  years: number[];
  tickers: string[];
  activeYear?: number;
  activeType?: TxType;
  activeTicker?: string;
}

function buildHref(
  patch: Partial<{ year: number | null; type: string | null; ticker: string | null }>,
  current: TransactionFiltersProps,
): string {
  const params = new URLSearchParams();
  const year = patch.year !== undefined ? patch.year : current.activeYear ?? null;
  const type = patch.type !== undefined ? patch.type : current.activeType ?? null;
  const ticker =
    patch.ticker !== undefined ? patch.ticker : current.activeTicker ?? null;
  if (year !== null && year !== undefined) params.set("year", String(year));
  if (type) params.set("type", type);
  if (ticker) params.set("ticker", ticker);
  const qs = params.toString();
  return qs ? `/transacties?${qs}` : "/transacties";
}

export function TransactionFilters(props: TransactionFiltersProps) {
  const hasFilter = !!(props.activeYear || props.activeType || props.activeTicker);
  return (
    <div className="flex flex-col gap-3 rounded-md border border-border/60 bg-surface/60 p-3">
      <FilterRow label="Jaar">
        <FilterChip
          href={buildHref({ year: null }, props)}
          active={!props.activeYear}
        >
          Alle
        </FilterChip>
        {props.years.map((y) => (
          <FilterChip
            key={y}
            href={buildHref({ year: y }, props)}
            active={props.activeYear === y}
          >
            {y}
          </FilterChip>
        ))}
      </FilterRow>

      <FilterRow label="Type">
        <FilterChip
          href={buildHref({ type: null }, props)}
          active={!props.activeType}
        >
          Alle
        </FilterChip>
        {TYPES.map((t) => (
          <FilterChip
            key={t}
            href={buildHref({ type: t }, props)}
            active={props.activeType === t}
          >
            {t}
          </FilterChip>
        ))}
      </FilterRow>

      {props.tickers.length > 0 && (
        <FilterRow label="Ticker">
          <FilterChip
            href={buildHref({ ticker: null }, props)}
            active={!props.activeTicker}
          >
            Alle
          </FilterChip>
          {props.tickers.slice(0, 30).map((t) => (
            <FilterChip
              key={t}
              href={buildHref({ ticker: t }, props)}
              active={props.activeTicker === t}
            >
              {t}
            </FilterChip>
          ))}
        </FilterRow>
      )}

      {hasFilter && (
        <Link
          href={"/transacties" as Route}
          className="self-start text-xs text-muted-foreground hover:text-foreground"
        >
          Filters wissen
        </Link>
      )}
    </div>
  );
}

function FilterRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-12 shrink-0 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link href={href as Route} className="no-underline">
      <Badge
        variant={active ? "default" : "outline"}
        className={cn("cursor-pointer text-[11px]", active && "shadow-sm")}
      >
        {children}
      </Badge>
    </Link>
  );
}
