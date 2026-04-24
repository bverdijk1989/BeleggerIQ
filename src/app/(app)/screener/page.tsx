import { Telescope } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Section } from "@/components/common/section";
import { runScreen } from "@/lib/analytics/screener";

import { ScreenerFiltersForm } from "./components/screener-filters-form";
import { ScreenerResults } from "./components/screener-results";
import { parseFiltersFromSearchParams } from "./filters-serde";

export const metadata = {
  title: "Screener",
};

export const dynamic = "force-dynamic";

interface ScreenerPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ScreenerPage({
  searchParams,
}: ScreenerPageProps) {
  const resolvedParams = await searchParams;
  const filters = parseFiltersFromSearchParams(resolvedParams);
  const result = await runScreen({ filters, limit: 30 });
  const updatedAt = new Date(result.asOf).toLocaleString("nl-NL");

  return (
    <>
      <PageHeader
        eyebrow="Onderzoek"
        title="Screener"
        description={`Factor-first ranking over ${result.universeSize} aandelen en ETF's. Bijgewerkt ${updatedAt}.`}
      />

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-20 lg:self-start">
          <ScreenerFiltersForm initial={filters} />
        </div>

        <div className="space-y-4">
          <ResultsHeader
            total={result.totalAfterFilter}
            shown={result.candidates.length}
            preFiltered={result.preFiltered}
            universeSize={result.universeSize}
          />

          {result.candidates.length === 0 ? (
            <EmptyState
              icon={Telescope}
              title="Geen kandidaten gevonden"
              description="Verlaag je drempels, verbreed regio/sector-selectie of reset de filters."
            />
          ) : (
            <ScreenerResults candidates={result.candidates} />
          )}
        </div>
      </div>

      <Section
        title="Hoe we ranken"
        description="De volgorde is puur factor-based en reproducible — geen AI, geen heuristiek."
      >
        <div className="rounded-md border border-border/60 bg-surface/60 p-4 text-sm text-muted-foreground">
          Kandidaten worden gescoord op Quality, Value, Momentum en Risk. De
          composite is een gewogen gemiddelde. Filters trimmen het universe;
          daarna sorteert de engine op composite score aflopend. Drukt een
          fundamental-signal te weinig data uit, dan valt die sub-score terug op
          50 (neutraal).
        </div>
      </Section>
    </>
  );
}

function ResultsHeader({
  total,
  shown,
  preFiltered,
  universeSize,
}: {
  total: number;
  shown: number;
  preFiltered: number;
  universeSize: number;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 bg-surface/60 px-4 py-3 text-xs text-muted-foreground">
      <div>
        <span className="font-semibold text-foreground">{total}</span> kandidaten
        na filters
        <span className="mx-2 text-border">·</span>
        <span>{shown} zichtbaar</span>
      </div>
      <div>
        Universe: <span className="font-semibold text-foreground">{preFiltered}</span> /
        {" "}
        {universeSize}
      </div>
    </div>
  );
}
