"use client";

import { forwardRef, useRef, useState, useTransition } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Upload,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { parseDegiroCsv, type DegiroImportResult } from "@/lib/parsers/degiro";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";

import { importDegiroCsv } from "../actions";

interface ImportDegiroDialogProps {
  portfolioId?: string;
  /** Naam van de target-portefeuille voor in de header. */
  portfolioName?: string;
}

type CommitState =
  | { status: "idle" }
  | { status: "success"; created: number; updated: number; skipped: number }
  | { status: "error"; message: string };

export function ImportDegiroDialog({
  portfolioId,
  portfolioName,
}: ImportDegiroDialogProps) {
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<DegiroImportResult | null>(null);
  const [commitState, setCommitState] = useState<CommitState>({ status: "idle" });
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setFileName(null);
    setCsvText(null);
    setParseResult(null);
    setCommitState({ status: "idle" });
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleFile(file: File) {
    setCommitState({ status: "idle" });
    setFileName(file.name);
    // Guard rails: size + extension check. DEGIRO CSVs zijn doorgaans een
    // paar honderd KB; alles boven 5 MB is vrijwel zeker verkeerd bestand
    // of kwaadaardige input, en zou de browser-tab hangen bij .text().
    const MAX_BYTES = 5 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      setCommitState({
        status: "error",
        message: `Bestand is te groot (max ${Math.round(MAX_BYTES / 1024 / 1024)} MB).`,
      });
      setCsvText(null);
      setParseResult(null);
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
      setCsvText(null);
      setParseResult(null);
      return;
    }
    try {
      const text = await file.text();
      setCsvText(text);
      setParseResult(parseDegiroCsv(text));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Onbekende fout";
      setCommitState({ status: "error", message: `Bestand kon niet worden gelezen: ${message}` });
      setCsvText(null);
      setParseResult(null);
    }
  }

  function handleCommit() {
    if (!csvText || !parseResult || parseResult.holdings.length === 0) return;
    startTransition(async () => {
      const result = await importDegiroCsv({ csv: csvText, portfolioId });
      if (result.ok) {
        setCommitState({
          status: "success",
          created: result.created ?? 0,
          updated: result.updated ?? 0,
          skipped: result.skipped ?? 0,
        });
      } else {
        setCommitState({ status: "error", message: result.message });
      }
    });
  }

  const holdings = parseResult?.holdings ?? [];
  const warnings = parseResult?.warnings ?? [];
  const skipped = parseResult?.skipped ?? [];

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <SheetTrigger asChild>
        <Button size="sm" variant="outline">
          <Upload className="h-4 w-4" />
          DEGIRO import
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-4 overflow-y-auto sm:max-w-2xl"
      >
        <SheetHeader>
          <SheetTitle>DEGIRO CSV importeren</SheetTitle>
          <SheetDescription>
            Upload de export &quot;Portefeuille&quot; vanuit DEGIRO. Bestaande
            posities in{" "}
            <span className="font-medium text-foreground">
              {portfolioName ?? "je primaire portefeuille"}
            </span>{" "}
            worden bijgewerkt; nieuwe posities worden toegevoegd.
          </SheetDescription>
        </SheetHeader>

        <FilePicker
          ref={inputRef}
          fileName={fileName}
          onFile={handleFile}
          onClear={reset}
        />

        {parseResult && parseResult.holdings.length === 0 && (
          <Notice tone="warning" icon={AlertTriangle}>
            Geen open posities gedetecteerd. Controleer of je de juiste DEGIRO
            export hebt gebruikt.
          </Notice>
        )}

        {holdings.length > 0 && (
          <PreviewTable holdings={holdings} />
        )}

        {warnings.length > 0 && (
          <details className="rounded-md border border-border/60 bg-surface-muted/60 p-3 text-sm text-muted-foreground">
            <summary className="cursor-pointer font-medium text-foreground">
              {warnings.length} waarschuwing{warnings.length === 1 ? "" : "en"}
            </summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </details>
        )}

        {skipped.length > 0 && (
          <details className="rounded-md border border-border/60 bg-surface-muted/60 p-3 text-sm text-muted-foreground">
            <summary className="cursor-pointer font-medium text-foreground">
              {skipped.length} rij{skipped.length === 1 ? "" : "en"} overgeslagen
            </summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {skipped.map((s, i) => (
                <li key={i}>
                  Rij {s.row}: {s.reason}
                </li>
              ))}
            </ul>
          </details>
        )}

        {commitState.status === "success" && (
          <Notice tone="success" icon={CheckCircle2}>
            {commitState.created} nieuwe en {commitState.updated} bijgewerkte
            posities geïmporteerd
            {commitState.skipped > 0
              ? `, ${commitState.skipped} overgeslagen`
              : ""}
            .
          </Notice>
        )}
        {commitState.status === "error" && (
          <Notice tone="destructive" icon={AlertTriangle}>
            {commitState.message}
          </Notice>
        )}

        <div className="mt-auto flex items-center justify-end gap-2 border-t border-border/60 pt-4">
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={isPending}>
            Annuleren
          </Button>
          <Button
            onClick={handleCommit}
            disabled={
              isPending ||
              !holdings.length ||
              commitState.status === "success"
            }
          >
            {isPending ? "Bezig met importeren…" : `Importeer ${holdings.length}`}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ============================================================
//  Subcomponents
// ============================================================

interface FilePickerProps {
  fileName: string | null;
  onFile: (file: File) => void;
  onClear: () => void;
}

const FilePicker = forwardRef<HTMLInputElement, FilePickerProps>(
  ({ fileName, onFile, onClear }, ref) => (
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
          Accepteert NL- en EN-export. Alleen open posities worden geïmporteerd.
        </p>
      </div>
      {fileName && (
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-elevated hover:text-foreground"
          onClick={(e) => {
            e.preventDefault();
            onClear();
          }}
          aria-label="Bestand wissen"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      <input
        ref={ref}
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
        }}
      />
    </label>
  ),
);
FilePicker.displayName = "FilePicker";

function PreviewTable({ holdings }: { holdings: DegiroImportResult["holdings"] }) {
  return (
    <div className="overflow-hidden rounded-md border border-border/60">
      <table className="w-full text-sm">
        <thead className="bg-surface-muted/60 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Product</th>
            <th className="px-3 py-2 text-left font-medium">Ticker</th>
            <th className="px-3 py-2 text-right font-medium">Aantal</th>
            <th className="px-3 py-2 text-right font-medium">Slotkoers</th>
            <th className="px-3 py-2 text-right font-medium">Valuta</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {holdings.map((h) => (
            <tr key={h.isin ?? h.ticker} className="hover:bg-surface-elevated/40">
              <td className="px-3 py-2">
                <div className="font-medium text-foreground">{h.name}</div>
                <div className="text-xs text-muted-foreground">
                  {h.isin ?? "—"} · {h.assetClass}
                </div>
              </td>
              <td className="px-3 py-2 font-mono text-xs text-foreground">
                {h.ticker}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {formatNumber(h.quantity, h.quantity % 1 === 0 ? 0 : 4)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {h.currentPrice !== null
                  ? formatCurrency(h.currentPrice, h.currency)
                  : "—"}
              </td>
              <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">
                {h.currency}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type NoticeTone = "success" | "warning" | "destructive";

function Notice({
  tone,
  icon: Icon,
  children,
}: {
  tone: NoticeTone;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  const toneClass = {
    success: "border-success/40 bg-success/10 text-success",
    warning: "border-warning/40 bg-warning/10 text-warning",
    destructive: "border-destructive/40 bg-destructive/10 text-destructive",
  }[tone];

  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
        toneClass,
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1">{children}</div>
    </div>
  );
}
