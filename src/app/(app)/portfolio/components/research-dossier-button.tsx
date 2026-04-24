"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckSquare,
  FileText,
  Info,
  Loader2,
  ListChecks,
  Sparkles,
  TrendingDown,
  TrendingUp,
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
import type {
  ResearchDossier,
  ResearchSource,
} from "@/lib/ai/research-dossier";
import { cn } from "@/lib/utils";

/**
 * UI-knop "Maak research dossier" + Sheet die het deterministische
 * dossier toont. Geen client-side businesslogica: de knop fetcht
 * `/api/ai/research-dossier`, ontvangt een vooraf-bouwde dossier en
 * rendert dat. UI doet **geen** rekenwerk.
 */

interface Props {
  ticker: string;
  /** Optionele label (bv. naam van de holding) — alleen visueel. */
  label?: string;
}

interface DossierResponse {
  dossier: ResearchDossier;
  diagnostics: {
    foundHolding: boolean;
    fundamentalsAvailable: boolean;
    factorScored: boolean;
    historyDays: number;
  };
}

const SOURCE_LABEL: Record<ResearchSource, string> = {
  "factor-engine": "Factor-engine",
  fundamentals: "Fundamentals",
  classifier: "Classifier",
  "rebalance-engine": "Rebalance-engine",
  "mispricing-scanner": "Mispricing-scanner",
  "opportunity-radar": "Opportunity-radar",
};

export function ResearchDossierButton({ ticker, label }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DossierResponse | null>(null);

  async function fetchDossier(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/research-dossier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as DossierResponse;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Onbekende fout.");
    } finally {
      setLoading(false);
    }
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next && !data && !loading) {
      void fetchDossier();
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="gap-1.5 text-xs"
          aria-label={`Research dossier voor ${label ?? ticker}`}
        >
          <Sparkles className="h-3.5 w-3.5" />
          Dossier
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Research-dossier
          </SheetTitle>
          <SheetDescription>
            Engine-output gestructureerd in NL. Geen koop- of verkoopadvies.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Dossier samenstellen…
            </div>
          )}
          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="mr-1 inline h-4 w-4" />
              {error}
            </div>
          )}
          {data && <DossierBody data={data} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ============================================================
//  Dossier-body
// ============================================================

function DossierBody({ data }: { data: DossierResponse }) {
  const d = data.dossier;
  return (
    <div className="space-y-5">
      <Header dossier={d} />
      <Thesis text={d.thesis} />
      <ConfidenceStrip
        confidence={d.confidence}
        note={d.uncertaintyNote}
        sources={d.sourceEngines}
      />
      <KeyNumbers dossier={d} />
      <BulletSection
        title="Bull case"
        icon={<TrendingUp className="h-4 w-4 text-success" />}
        items={d.bullCase}
        emptyText="Geen bull-argumenten uit de engines."
      />
      <BulletSection
        title="Bear case"
        icon={<TrendingDown className="h-4 w-4 text-destructive" />}
        items={d.bearCase}
        emptyText="Geen bear-argumenten uit de engines."
      />
      <BulletSection
        title="Risico's"
        icon={<AlertTriangle className="h-4 w-4 text-warning" />}
        items={d.risks}
        emptyText="Geen geregistreerde risk-flags."
      />
      <Checklist items={d.decisionChecklist} />
      <MissingData items={d.missingData} />
    </div>
  );
}

function Header({ dossier }: { dossier: ResearchDossier }) {
  const generated = new Date(dossier.generatedAt).toLocaleString("nl-NL");
  return (
    <div className="rounded-md border border-border/60 bg-surface/40 p-3">
      <p className="text-sm font-semibold text-foreground">
        {dossier.name ?? dossier.ticker}
      </p>
      <p className="font-mono text-[11px] text-muted-foreground">
        {dossier.ticker} · gegenereerd {generated}
      </p>
    </div>
  );
}

function Thesis({ text }: { text: string }) {
  return (
    <section>
      <SectionHeading icon={<FileText className="h-3.5 w-3.5" />}>
        Thesis
      </SectionHeading>
      <p className="mt-2 text-sm text-foreground">{text}</p>
    </section>
  );
}

function ConfidenceStrip({
  confidence,
  note,
  sources,
}: {
  confidence: number;
  note: string;
  sources: ResearchSource[];
}) {
  const tone =
    confidence >= 0.75
      ? "border-success/40 bg-success/10 text-success"
      : confidence >= 0.5
        ? "border-warning/40 bg-warning/10 text-warning"
        : "border-destructive/40 bg-destructive/10 text-destructive";
  return (
    <div className={cn("rounded-md border p-3", tone)}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-80">
        Confidence
      </p>
      <p className="mt-1 font-mono text-sm tabular-nums">
        {(confidence * 100).toFixed(0)}%
      </p>
      <p className="mt-1 text-[11px] opacity-90">{note}</p>
      {sources.length > 0 && (
        <p className="mt-1 text-[11px] opacity-80">
          Bronnen: {sources.map((s) => SOURCE_LABEL[s]).join(", ")}
        </p>
      )}
    </div>
  );
}

function KeyNumbers({ dossier }: { dossier: ResearchDossier }) {
  if (dossier.keyNumbers.length === 0) {
    return (
      <section>
        <SectionHeading icon={<Info className="h-3.5 w-3.5" />}>
          Belangrijkste cijfers
        </SectionHeading>
        <p className="mt-2 text-xs text-muted-foreground">
          Geen cijfers beschikbaar — engine-output ontbreekt.
        </p>
      </section>
    );
  }
  return (
    <section>
      <SectionHeading icon={<Info className="h-3.5 w-3.5" />}>
        Belangrijkste cijfers
      </SectionHeading>
      <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {dossier.keyNumbers.map((m, i) => (
          <li
            key={`${m.label}-${i}`}
            className="rounded-md border border-border/60 bg-surface/40 p-2"
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {m.label}
            </p>
            <p className="mt-0.5 font-mono text-sm tabular-nums text-foreground">
              {m.value}
            </p>
            {m.helper && (
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {m.helper}
              </p>
            )}
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              bron: {SOURCE_LABEL[m.source]}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function BulletSection({
  title,
  icon,
  items,
  emptyText,
}: {
  title: string;
  icon: React.ReactNode;
  items: string[];
  emptyText: string;
}) {
  return (
    <section>
      <SectionHeading icon={icon}>{title}</SectionHeading>
      {items.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {items.map((text, i) => (
            <li
              key={i}
              className="flex items-start gap-2 text-sm text-foreground"
            >
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
              <span>{text}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Checklist({ items }: { items: string[] }) {
  return (
    <section>
      <SectionHeading icon={<ListChecks className="h-3.5 w-3.5" />}>
        Besluitchecklist
      </SectionHeading>
      <ul className="mt-2 space-y-1.5">
        {items.map((q, i) => (
          <li
            key={i}
            className="flex items-start gap-2 rounded-md border border-border/60 bg-surface/40 p-2 text-xs text-foreground"
          >
            <CheckSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span>{q}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function MissingData({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <section>
      <SectionHeading icon={<AlertTriangle className="h-3.5 w-3.5 text-warning" />}>
        Ontbrekende data
      </SectionHeading>
      <ul className="mt-2 space-y-1">
        {items.map((m, i) => (
          <li
            key={i}
            className="flex items-start gap-2 text-xs text-warning"
          >
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-warning" />
            <span>{m}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SectionHeading({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
      {icon}
      {children}
    </h3>
  );
}
