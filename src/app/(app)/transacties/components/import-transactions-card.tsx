"use client";

import { useRef, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { parseDegiroCsv } from "@/lib/transactions/degiro-parser";
import type { ParseResult } from "@/lib/transactions/types";
import { cn } from "@/lib/utils";

import { commitTransactionsCsv } from "../actions";

/**
 * Importeer-card voor de /transacties pagina.
 *
 * Flow:
 *   1. Drag-drop / klik om CSV-bestand te kiezen
 *   2. Client-side parse → preview-tabel met validatie-fouten
 *   3. Server-side parse + commit (server vertrouwt nooit de client-payload)
 *   4. Per-rij status: inserted / skipped (duplicate) / error
 */

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

type CommitState =
  | { status: "idle" }
  | { status: "success"; inserted: number; skipped: number; errors: number }
  | { status: "error"; message: string };

interface ImportTransactionsCardProps {
  portfolioId?: string;
  /** Externe IDs die al in de database staan (voor duplicate-detection in preview). */
  existingExternalIds?: string[];
}

export function ImportTransactionsCard({
  portfolioId,
  existingExternalIds = [],
}: ImportTransactionsCardProps) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [preview, setPreview] = useState<ParseResult | null>(null);
  const [commitState, setCommitState] = useState<CommitState>({ status: "idle" });
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setFileName(null);
    setCsvText(null);
    setPreview(null);
    setCommitState({ status: "idle" });
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleFile(file: File) {
    setCommitState({ status: "idle" });
    setFileName(file.name);

    if (file.size > MAX_BYTES) {
      setCommitState({
        status: "error",
        message: `Bestand is te groot (max ${Math.round(MAX_BYTES / 1024 / 1024)} MB).`,
      });
      return;
    }
    const looksLikeCsv =
      file.name.toLowerCase().endsWith(".csv") ||
      file.type.includes("csv") ||
      file.type.startsWith("text/");
    if (!looksLikeCsv) {
      setCommitState({
        status: "error",
        message: "Alleen .csv / text-bestanden worden ondersteund.",
      });
      return;
    }
    try {
      const text = await file.text();
      setCsvText(text);
      setPreview(parseDegiroCsv(text));
    } catch (error) {
      setCommitState({
        status: "error",
        message:
          error instanceof Error
            ? `Bestand kon niet worden gelezen: ${error.message}`
            : "Bestand kon niet worden gelezen.",
      });
    }
  }

  function handleCommit() {
    if (!csvText || !preview || preview.transactions.length === 0) return;
    startTransition(async () => {
      const result = await commitTransactionsCsv({ csv: csvText, portfolioId });
      if (result.ok && result.outcome) {
        setCommitState({
          status: "success",
          inserted: result.outcome.inserted,
          skipped: result.outcome.skipped,
          errors: result.outcome.errors,
        });
      } else {
        setCommitState({ status: "error", message: result.message });
      }
    });
  }

  const txs = preview?.transactions ?? [];
  const errors = preview?.errors ?? [];
  const existingSet = new Set(existingExternalIds);
  const dupCount = txs.filter((t) => existingSet.has(t.externalId)).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Transacties importeren</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Upload de DEGIRO &ldquo;Account&rdquo; CSV-export. Wij parsen
          BUY/SELL, dividenden, fees en belasting. Duplicaten worden
          automatisch overgeslagen via de externalId van iedere rij.
        </p>

        <FilePicker
          inputRef={inputRef}
          fileName={fileName}
          onFile={handleFile}
          onClear={reset}
        />

        {preview && (
          <div className="rounded-md border border-border/60 bg-surface/60 p-3 text-sm">
            <p className="font-medium text-foreground">
              {txs.length} transactie{txs.length === 1 ? "" : "s"} gevonden
              {errors.length > 0 ? ` · ${errors.length} fout${errors.length === 1 ? "" : "en"}` : ""}
              {dupCount > 0 ? ` · ${dupCount} duplica${dupCount === 1 ? "at" : "ten"}` : ""}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {txs.length} rijen ge&iuml;dentificeerd. Klik op
              &ldquo;Importeren&rdquo; om duplicaten over te slaan en
              nieuwe rijen op te slaan.
            </p>
          </div>
        )}

        {txs.length > 0 && <PreviewTable txs={txs} existingSet={existingSet} />}

        {errors.length > 0 && (
          <details className="rounded-md border border-border/60 bg-surface-muted/60 p-3 text-sm text-muted-foreground">
            <summary className="cursor-pointer font-medium text-foreground">
              {errors.length} rij{errors.length === 1 ? "" : "en"} overgeslagen
              wegens validatie-fouten
            </summary>
            <ul className="mt-2 max-h-40 overflow-y-auto list-disc space-y-1 pl-5 text-xs">
              {errors.slice(0, 50).map((e, i) => (
                <li key={i}>
                  Rij {e.rowIndex + 2}: {e.reason}
                </li>
              ))}
              {errors.length > 50 && (
                <li className="opacity-60">
                  &hellip; en {errors.length - 50} meer
                </li>
              )}
            </ul>
          </details>
        )}

        {commitState.status === "success" && (
          <div className="flex items-center gap-2 rounded-md border border-success/40 bg-success/10 p-3 text-sm text-success">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>
              {commitState.inserted} nieuwe transacties opgeslagen.{" "}
              {commitState.skipped > 0 &&
                `${commitState.skipped} duplicaten overgeslagen. `}
              {commitState.errors > 0 &&
                `${commitState.errors} fouten — controleer de logs.`}
            </span>
          </div>
        )}
        {commitState.status === "error" && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{commitState.message}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          {fileName && (
            <Button variant="ghost" onClick={reset} disabled={isPending}>
              Wissen
            </Button>
          )}
          <Button
            onClick={handleCommit}
            disabled={
              isPending ||
              !txs.length ||
              commitState.status === "success"
            }
          >
            {isPending ? "Bezig met importeren…" : `Importeer ${txs.length}`}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
//  Subcomponents
// ============================================================

interface FilePickerProps {
  fileName: string | null;
  inputRef: React.RefObject<HTMLInputElement>;
  onFile: (file: File) => void;
  onClear: () => void;
}

function FilePicker({ fileName, inputRef, onFile, onClear }: FilePickerProps) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-md border border-dashed border-border/70 bg-surface/60 p-4 text-sm transition-colors",
        "hover:border-primary/40 hover:bg-surface-elevated/60",
      )}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-md bg-surface-elevated text-primary">
        <FileSpreadsheet className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground">
          {fileName ?? "Kies een DEGIRO CSV-bestand"}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          NL-export &ldquo;Account&rdquo;. Max 5 MB.
        </p>
      </div>
      {fileName ? (
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            onClear();
          }}
          className="text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Bestand wissen"
        >
          <X className="h-4 w-4" />
        </button>
      ) : (
        <Upload className="h-4 w-4 text-muted-foreground" />
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
        }}
      />
    </label>
  );
}

interface PreviewTableProps {
  txs: ParseResult["transactions"];
  existingSet: Set<string>;
}

function PreviewTable({ txs, existingSet }: PreviewTableProps) {
  const visible = txs.slice(0, 25);
  return (
    <div className="overflow-hidden rounded-md border border-border/60">
      <div className="max-h-72 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-surface-elevated text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-2 py-1.5 text-left">Datum</th>
              <th className="px-2 py-1.5 text-left">Type</th>
              <th className="px-2 py-1.5 text-left">Product</th>
              <th className="px-2 py-1.5 text-right">Aantal</th>
              <th className="px-2 py-1.5 text-right">Bedrag</th>
              <th className="px-2 py-1.5 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((tx, i) => {
              const isDup = existingSet.has(tx.externalId);
              return (
                <tr
                  key={`${tx.externalId}-${i}`}
                  className={cn(
                    "border-t border-border/40 hover:bg-surface-elevated/40",
                    isDup && "opacity-60",
                  )}
                >
                  <td className="px-2 py-1.5 tabular-nums">
                    {tx.executedAt.toISOString().slice(0, 10)}
                  </td>
                  <td className="px-2 py-1.5 font-medium text-foreground">
                    {tx.type}
                  </td>
                  <td className="px-2 py-1.5 truncate max-w-[200px]" title={tx.name ?? ""}>
                    {tx.name ?? "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {tx.quantity ?? "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {tx.signedAmount !== null
                      ? `${tx.signedAmount.toFixed(2)} ${tx.currency}`
                      : "—"}
                  </td>
                  <td className="px-2 py-1.5">
                    {isDup ? (
                      <span className="text-warning">duplicaat</span>
                    ) : (
                      <span className="text-success">nieuw</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {txs.length > visible.length && (
        <p className="border-t border-border/60 bg-surface-muted/40 px-2 py-1.5 text-[10px] text-muted-foreground">
          Eerste {visible.length} van {txs.length} rijen getoond.
        </p>
      )}
    </div>
  );
}
