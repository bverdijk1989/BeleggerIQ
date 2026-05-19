import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Lightbulb,
  ShieldAlert,
  ShieldCheck,
  Target,
} from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Section } from "@/components/common/section";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { buildPortfolioView } from "@/lib/analytics";
import {
  loadRiskControlTowerReport,
  SEVERITY_LABELS,
  type RiskCategoryReport,
  type RiskSeverityTone,
} from "@/lib/analytics/risk-control-tower";
import { resolveUserFromServer } from "@/lib/auth";
import { portfolioRepository } from "@/lib/data";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Risk Control Tower",
};

export const dynamic = "force-dynamic";

/**
 * /risk-tower — Risk Control Tower (Module 29).
 *
 * Eén overzicht met 12 risicocategorieën, severity-model green/orange/red/gray,
 * risk-budget + per-categorie detail + actiepunt.
 *
 * Geen entitlement-gate — risico-transparantie is core voor elke gebruiker.
 */
export default async function RiskTowerPage() {
  const auth = await resolveUserFromServer();
  if (!auth.ok) {
    return (
      <>
        <PageHeader
          eyebrow="Analyse"
          title="Risk Control Tower"
          description="Authenticatie vereist."
        />
        <EmptyState
          icon={ShieldAlert}
          title="Niet ingelogd"
          description={auth.error}
        />
      </>
    );
  }

  const portfolio = await portfolioRepository
    .findPrimaryByEmail(auth.user.email)
    .catch(() => null);

  if (!portfolio || portfolio.holdings.length === 0) {
    return (
      <>
        <PageHeader
          eyebrow="Analyse"
          title="Risk Control Tower"
          description="Voeg eerst posities toe om risico's te meten."
        />
        <EmptyState
          icon={ShieldCheck}
          title="Geen posities"
          description="De Risk Control Tower analyseert je portefeuille per as. Voeg minimaal één positie toe."
        />
      </>
    );
  }

  const view = await buildPortfolioView(portfolio, {
    includeFundamentals: true,
    includeFactorScores: true,
  });

  const report = await loadRiskControlTowerReport({
    view,
    userEmail: auth.user.email,
  });

  return (
    <>
      <PageHeader
        eyebrow="Analyse"
        title="Risk Control Tower"
        description={report.headline}
        actions={
          <Badge variant="outline" className="text-[10px]">
            12 categorieën
          </Badge>
        }
      />

      <Section
        title="Risk-budget"
        description={report.budget.summary}
      >
        <RiskBudgetCard tone={report.budget.tone} utilization={report.budget.utilization} counts={report.counts} />
      </Section>

      <Section
        title="Categorieën"
        description="Klik een categorie open voor uitleg en suggestie. Grijs = geen data, niet 'veilig'."
      >
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
          {report.categories.map((cat) => (
            <CategoryCard key={cat.key} category={cat} />
          ))}
        </div>
      </Section>

      <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-[11px] text-amber-100">
        <p className="flex items-start gap-2">
          <Lightbulb className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          <span>{report.disclaimer}</span>
        </p>
      </div>
    </>
  );
}

// ============================================================
//  Subcomponents
// ============================================================

function RiskBudgetCard({
  tone,
  utilization,
  counts,
}: {
  tone: RiskSeverityTone;
  utilization: number;
  counts: Record<RiskSeverityTone, number>;
}) {
  const pct = Math.round(utilization * 100);
  return (
    <Card className="border-border/60">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-baseline gap-3">
          <span className={cn("font-mono text-4xl font-bold", toneText(tone))}>
            {pct}%
          </span>
          <span className="text-sm text-muted-foreground">benut</span>
          <Badge variant="outline" className={cn("ml-auto text-[10px]", toneClass(tone))}>
            <Target className="mr-1 h-3 w-3" />
            {tone === "gray" ? "Onbekend" : tone === "green" ? "Ruim" : tone === "orange" ? "Gemiddeld" : "Krap"}
          </Badge>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted/30">
          <div
            className={cn(
              "h-full",
              tone === "red" && "bg-rose-500",
              tone === "orange" && "bg-amber-500",
              tone === "green" && "bg-emerald-500",
              tone === "gray" && "bg-muted-foreground/40",
            )}
            style={{ width: `${Math.max(2, Math.min(100, pct))}%` }}
          />
        </div>
        <div className="grid grid-cols-4 gap-2 text-[10px]">
          <CountBadge tone="green" label="Laag" count={counts.green} />
          <CountBadge tone="orange" label="Verhoogd" count={counts.orange} />
          <CountBadge tone="red" label="Hoog" count={counts.red} />
          <CountBadge tone="gray" label="Onbekend" count={counts.gray} />
        </div>
      </CardContent>
    </Card>
  );
}

function CountBadge({
  tone,
  label,
  count,
}: {
  tone: RiskSeverityTone;
  label: string;
  count: number;
}) {
  return (
    <div className="rounded-md border border-border/40 bg-background/40 p-2 text-center">
      <p className={cn("font-mono text-base", toneText(tone))}>{count}</p>
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

function CategoryCard({ category }: { category: RiskCategoryReport }) {
  const Icon = iconForSeverity(category.severity);
  return (
    <details
      className={cn(
        "group rounded-md border bg-surface/40",
        toneBorder(category.severity),
      )}
    >
      <summary className="flex cursor-pointer items-center justify-between gap-2 p-3">
        <div className="flex items-center gap-2">
          <Icon className={cn("h-4 w-4 shrink-0", toneText(category.severity))} aria-hidden />
          <div>
            <p className="text-sm font-semibold text-foreground">
              {category.label}
            </p>
            <p className="font-mono text-[11px] text-muted-foreground">
              {category.headlineMetric}
            </p>
          </div>
        </div>
        <Badge
          variant="outline"
          className={cn("text-[10px]", toneClass(category.severity))}
        >
          {SEVERITY_LABELS[category.severity]}
          {category.score !== null ? ` · ${category.score}` : ""}
        </Badge>
      </summary>
      <div className="space-y-2 border-t border-border/40 px-3 py-3 text-xs text-muted-foreground">
        <p>{category.explanation}</p>
        <p className="rounded-md border border-border/40 bg-background/40 p-2">
          <strong className="text-foreground">Suggestie:</strong>{" "}
          {category.actionSuggestion}
        </p>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
          bron: {category.source}
        </p>
      </div>
    </details>
  );
}

// ============================================================
//  Tone helpers
// ============================================================

function toneText(tone: RiskSeverityTone): string {
  switch (tone) {
    case "green":
      return "text-emerald-300";
    case "orange":
      return "text-amber-300";
    case "red":
      return "text-rose-300";
    case "gray":
      return "text-muted-foreground";
  }
}

function toneClass(tone: RiskSeverityTone): string {
  switch (tone) {
    case "green":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
    case "orange":
      return "border-amber-500/40 bg-amber-500/10 text-amber-200";
    case "red":
      return "border-rose-500/40 bg-rose-500/10 text-rose-200";
    case "gray":
      return "border-muted-foreground/30 bg-muted/10 text-muted-foreground";
  }
}

function toneBorder(tone: RiskSeverityTone): string {
  switch (tone) {
    case "green":
      return "border-emerald-500/30";
    case "orange":
      return "border-amber-500/30";
    case "red":
      return "border-rose-500/30";
    case "gray":
      return "border-border/40";
  }
}

function iconForSeverity(tone: RiskSeverityTone) {
  switch (tone) {
    case "green":
      return CheckCircle2;
    case "orange":
      return AlertTriangle;
    case "red":
      return AlertOctagon;
    case "gray":
      return CircleDashed;
  }
}
