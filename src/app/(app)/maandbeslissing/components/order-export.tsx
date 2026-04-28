"use client";

import { Check, ClipboardCopy, Download, ShieldAlert } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ORDER_DISCLAIMER,
  buildOrderCsv,
  buildOrderTsv,
} from "@/lib/orders/serialize";
import type { OrderRow } from "@/lib/orders/build-orders";

interface OrderExportProps {
  rows: OrderRow[];
  fileName: string;
}

/**
 * Export-card op /maandbeslissing.
 *
 * Bewust GEEN broker-koppeling. Alleen download (CSV) of copy-to-
 * clipboard (TSV — plakt netjes in Excel/Sheets). De gebruiker plaatst
 * de orders zelf bij z'n broker en blijft verantwoordelijk voor
 * uitvoering, prijslimieten en eindcontrole.
 */
export function OrderExport({ rows, fileName }: OrderExportProps) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-muted-foreground">
          Geen koop- of verkooporders deze maand. Wanneer de engine BUY/SELL
          adviseert, verschijnt hier een download- en clipboard-knop.
        </CardContent>
      </Card>
    );
  }

  function handleDownload() {
    setError(null);
    try {
      const csv = buildOrderCsv(rows);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download mislukte.");
    }
  }

  async function handleCopy() {
    setError(null);
    try {
      const tsv = buildOrderTsv(rows);
      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === "function"
      ) {
        await navigator.clipboard.writeText(tsv);
      } else {
        // Fallback voor oudere browsers / niet-secure contexts.
        const textarea = document.createElement("textarea");
        textarea.value = tsv;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Copy mislukte.");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <p className="text-foreground">
          <strong>Geen automatische uitvoering.</strong> Je blijft zelf
          verantwoordelijk voor het plaatsen, controleren en verwerken van
          orders bij je broker. Verifieer altijd ticker, bedrag, limit-prijs
          en bestaande positie vóór je een order doorgeeft.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {rows.length} order{rows.length === 1 ? "" : "s"} klaar voor
              handmatige invoer bij je broker.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleCopy}>
                {copied ? (
                  <Check className="h-4 w-4 text-success" />
                ) : (
                  <ClipboardCopy className="h-4 w-4" />
                )}
                {copied ? "Gekopieerd" : "Kopieer (TSV)"}
              </Button>
              <Button variant="default" size="sm" onClick={handleDownload}>
                <Download className="h-4 w-4" />
                CSV downloaden
              </Button>
            </div>
          </div>

          <div className="overflow-hidden rounded-md border border-border/60">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-surface-elevated text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Ticker</th>
                    <th className="px-3 py-2 text-left">ISIN</th>
                    <th className="px-3 py-2 text-left">Side</th>
                    <th className="px-3 py-2 text-right">Bedrag</th>
                    <th className="px-3 py-2 text-right">Aantal</th>
                    <th className="px-3 py-2 text-right">Quote</th>
                    <th className="px-3 py-2 text-left">Order type</th>
                    <th className="px-3 py-2 text-right">Limit</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={`${row.ticker}-${row.side}`}
                      className="border-t border-border/40"
                    >
                      <td className="px-3 py-1.5 font-medium tabular-nums">
                        {row.ticker}
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground tabular-nums">
                        {row.isin ?? "—"}
                      </td>
                      <td
                        className={
                          row.side === "BUY"
                            ? "px-3 py-1.5 font-medium text-primary"
                            : "px-3 py-1.5 font-medium text-warning"
                        }
                      >
                        {row.side}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {row.amount.toLocaleString("nl-NL", {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-medium">
                        {row.quantity}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                        {row.latestQuote !== null
                          ? `${row.latestQuote.toFixed(2)}${row.quoteCurrency ? ` ${row.quoteCurrency}` : ""}`
                          : "—"}
                      </td>
                      <td className="px-3 py-1.5">{row.orderType}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {row.limitPrice !== null ? row.limitPrice.toFixed(2) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground">
            {ORDER_DISCLAIMER}
          </p>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
