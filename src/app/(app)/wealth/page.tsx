import {
  AlertTriangle,
  CalendarCheck,
  CheckCircle2,
  Coins,
  Download,
  Info,
  ShieldAlert,
  Target,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Section } from "@/components/common/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  loadWealthDashboard,
  type WealthCourseStatus,
  type WealthDashboardReport,
} from "@/lib/analytics/wealth";
import { resolveUserFromServer } from "@/lib/auth";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Long-Term Wealth",
};

export const dynamic = "force-dynamic";

/**
 * /wealth — Long-Term Wealth Dashboard (Module 21).
 *
 * Bedoeld voor de langetermijn-belegger: één pagina die toont of
 * je op koers ligt richting je doelen, met 10-jaars-projectie,
 * drift, maandelijkse discipline en (indien data beschikbaar)
 * verwachte dividend-inkomen.
 *
 * Aannames staan EXPLICIET in de projectie-card zodat schijnzekerheid
 * voorkomen wordt (Module 11 + 17 patroon).
 */
export default async function WealthPage() {
  const auth = await resolveUserFromServer();
  if (!auth.ok) {
    return (
      <>
        <PageHeader
          eyebrow="Lange termijn"
          title="Wealth Dashboard"
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

  const report = await loadWealthDashboard({ userEmail: auth.user.email });
  if (!report) {
    return (
      <>
        <PageHeader
          eyebrow="Lange termijn"
          title="Wealth Dashboard"
          description="Voeg een portefeuille toe om je 10-jaars-projectie te zien."
        />
        <EmptyState
          icon={Target}
          title="Geen portefeuille gevonden"
          description="Importeer holdings of voeg posities toe via /portfolio."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Lange termijn"
        title="Wealth Dashboard"
        description={report.course.message}
        actions={
          <Badge
            variant="outline"
            className={cn("text-[10px]", courseToBadge(report.course.status))}
          >
            {courseLabel(report.course.status)}
          </Badge>
        }
      />

      {/* 1. Ben ik op koers? */}
      <Section
        title="Ben ik op koers?"
        description="Aggregaat over al je financiële doelen."
      >
        <CourseCard report={report} />
      </Section>

      {/* 2. 10-jaars projectie */}
      <Section
        title="10-jaars projectie"
        description={`Bij maandinleg van ${formatCurrency(report.projection.monthlyContribution, report.baseCurrency)} over 10 jaar.`}
      >
        <ProjectionCards report={report} />
        <AssumptionsBlock report={report} />
      </Section>

      {/* 3. Drift t.o.v. doelallocatie */}
      <Section
        title="Drift t.o.v. doelallocatie"
        description={`Alignment-score ${report.drift.alignmentScore}/100 · ${report.drift.significantDrifts} posities met afwijking >2pp`}
      >
        <DriftCards report={report} />
      </Section>

      {/* 4. Maandelijkse discipline */}
      <Section
        title="Maandelijkse discipline"
        description={`Periode ${report.discipline.month}`}
      >
        <DisciplineCard report={report} />
      </Section>

      {/* 5. Verwachte dividend-inkomen */}
      {report.dividendIncome && (
        <Section
          title="Verwachte dividend-inkomen"
          description="Op basis van huidige holdings en gepubliceerde yields."
        >
          <DividendCard report={report} />
        </Section>
      )}

      {/* 6+7. Scenario-uitleg */}
      <Section
        title="Wat betekent dit voor mijn doel?"
        description="Drie scenario's, één conclusie."
      >
        <ScenarioExplanation report={report} />
      </Section>

      {/* 8. Export */}
      <Section
        title="Samenvatting voor je administratie"
        description="Markdown-export — kopieer of bewaar voor je eigen archief."
      >
        <ExportBlock report={report} />
      </Section>

      <div className="rounded-md border border-border/40 bg-muted/10 p-3 text-[11px] text-muted-foreground">
        <p className="flex items-start gap-2">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          <span>{report.disclaimer}</span>
        </p>
      </div>
    </>
  );
}

// ============================================================
//  Sub-components
// ============================================================

function CourseCard({ report }: { report: WealthDashboardReport }) {
  const tone = courseTone(report.course.status);
  return (
    <Card className={cn("border", tone)}>
      <CardContent className="space-y-2 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
          {report.course.status === "on_track" ||
          report.course.status === "mostly_on_track" ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-amber-400" />
          )}
          {courseLabel(report.course.status)}
        </p>
        <p className="text-sm text-foreground">{report.course.message}</p>
        <p className="text-xs text-muted-foreground">
          {report.course.achievableGoals} van {report.course.totalGoals} doelen
          op koers.
        </p>
        {report.goals.length > 0 && (
          <ul className="space-y-1 pt-1">
            {report.goals.slice(0, 5).map(({ goal, feasibilityTier, progress }) => (
              <li
                key={goal.id}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <span className="text-muted-foreground">{goal.name}</span>
                <span className="flex items-center gap-2 font-mono">
                  {Math.round(progress * 100)}%
                  <Badge
                    variant="outline"
                    className={cn("text-[10px]", tierToBadge(feasibilityTier))}
                  >
                    {feasibilityTier}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        )}
        {report.goals.length === 0 && (
          <Button asChild size="sm" variant="outline">
            <Link href={"/doelen/nieuw" as never}>Stel je eerste doel in</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function ProjectionCards({ report }: { report: WealthDashboardReport }) {
  const { scenarios } = report.projection;
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <ScenarioCard
        label="Pessimistisch"
        tone="amber"
        annualReturn={scenarios.pessimistic.annualReturn}
        finalValue={scenarios.pessimistic.finalValue}
        currency={report.baseCurrency}
        delta={scenarios.pessimistic.finalValue - report.totalValue}
      />
      <ScenarioCard
        label="Neutraal"
        tone="emerald"
        annualReturn={scenarios.neutral.annualReturn}
        finalValue={scenarios.neutral.finalValue}
        currency={report.baseCurrency}
        delta={scenarios.neutral.finalValue - report.totalValue}
        highlight
      />
      <ScenarioCard
        label="Optimistisch"
        tone="blue"
        annualReturn={scenarios.optimistic.annualReturn}
        finalValue={scenarios.optimistic.finalValue}
        currency={report.baseCurrency}
        delta={scenarios.optimistic.finalValue - report.totalValue}
      />
    </div>
  );
}

function ScenarioCard({
  label,
  tone,
  annualReturn,
  finalValue,
  currency,
  delta,
  highlight = false,
}: {
  label: string;
  tone: "amber" | "emerald" | "blue";
  annualReturn: number;
  finalValue: number;
  currency: string;
  delta: number;
  highlight?: boolean;
}) {
  const toneClass = {
    amber: "border-amber-500/40 bg-amber-500/5",
    emerald: "border-emerald-500/40 bg-emerald-500/5",
    blue: "border-blue-500/40 bg-blue-500/5",
  }[tone];
  return (
    <Card
      className={cn("border", toneClass, highlight && "ring-2 ring-primary/40")}
    >
      <CardContent className="space-y-1 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {label} · {(annualReturn * 100).toFixed(1)}%/jr
        </p>
        <p className="font-mono text-lg font-bold text-foreground">
          {formatCurrency(finalValue, currency)}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {delta >= 0 ? "+" : ""}
          {formatCurrency(delta, currency)} t.o.v. nu
        </p>
      </CardContent>
    </Card>
  );
}

function AssumptionsBlock({ report }: { report: WealthDashboardReport }) {
  return (
    <details className="mt-3 rounded-md border border-border/40 bg-muted/10 p-3 text-xs">
      <summary className="cursor-pointer font-semibold text-muted-foreground">
        Aannames (klik om te tonen)
      </summary>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
        {report.projection.assumptions.map((a, i) => (
          <li key={i}>{a}</li>
        ))}
      </ul>
    </details>
  );
}

function DriftCards({ report }: { report: WealthDashboardReport }) {
  if (report.drift.topRows.length === 0) {
    return (
      <p className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-emerald-200">
        Geen drift gemeten — portefeuille ligt op target-allocatie.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {report.drift.topRows.map((row) => (
        <li
          key={row.ticker}
          className="flex items-center justify-between rounded-md border border-border/40 bg-surface/40 p-3 text-sm"
        >
          <div>
            <p className="font-semibold text-foreground">{row.ticker}</p>
            <p className="text-xs text-muted-foreground">{row.name}</p>
          </div>
          <div className="text-right text-xs">
            <p>
              Huidig: <span className="font-mono">{(row.currentWeight * 100).toFixed(1)}%</span>
            </p>
            <p>
              Target: <span className="font-mono">{(row.targetWeight * 100).toFixed(1)}%</span>
            </p>
            <p
              className={cn(
                "font-mono",
                row.deltaWeight > 0.02
                  ? "text-amber-300"
                  : row.deltaWeight < -0.02
                    ? "text-blue-300"
                    : "text-muted-foreground",
              )}
            >
              Δ {(row.deltaWeight * 100).toFixed(1)}pp
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function DisciplineCard({ report }: { report: WealthDashboardReport }) {
  const d = report.discipline;
  return (
    <Card
      className={cn(
        "border",
        d.onTrack
          ? "border-emerald-500/40 bg-emerald-500/5"
          : "border-amber-500/40 bg-amber-500/5",
      )}
    >
      <CardContent className="grid grid-cols-1 gap-3 p-4 lg:grid-cols-3">
        <Stat
          icon={CalendarCheck}
          label="Ingelegd deze maand"
          value={formatCurrency(d.contributedThisMonth, report.baseCurrency)}
        />
        <Stat
          icon={Target}
          label="Geplande inleg"
          value={formatCurrency(d.plannedMonthly, report.baseCurrency)}
        />
        <Stat
          icon={d.onTrack ? CheckCircle2 : AlertTriangle}
          label={d.onTrack ? "Voorsprong" : "Achterstand"}
          value={`${d.delta >= 0 ? "+" : ""}${formatCurrency(d.delta, report.baseCurrency)}`}
        />
      </CardContent>
    </Card>
  );
}

function DividendCard({ report }: { report: WealthDashboardReport }) {
  const d = report.dividendIncome!;
  return (
    <Card className="border border-emerald-500/30 bg-emerald-500/5">
      <CardContent className="grid grid-cols-1 gap-3 p-4 lg:grid-cols-3">
        <Stat
          icon={Coins}
          label="Verwacht per jaar"
          value={formatCurrency(d.annualGross, report.baseCurrency)}
        />
        <Stat
          icon={TrendingUp}
          label="Gewogen yield"
          value={`${(d.weightedYield * 100).toFixed(2)}%`}
        />
        <Stat
          icon={Info}
          label="Data-coverage"
          value={`${d.coveredPositions} van ${d.coveredPositions + d.uncoveredPositions} posities`}
        />
      </CardContent>
    </Card>
  );
}

function ScenarioExplanation({ report }: { report: WealthDashboardReport }) {
  const neutral = report.projection.scenarios.neutral.finalValue;
  const pess = report.projection.scenarios.pessimistic.finalValue;
  const optim = report.projection.scenarios.optimistic.finalValue;
  return (
    <div className="rounded-md border border-border/40 bg-surface/40 p-4 text-sm">
      <p className="text-foreground">
        Bij je huidige inleg + risicoprofiel zou je portefeuille over 10 jaar
        ergens tussen{" "}
        <strong>{formatCurrency(pess, report.baseCurrency)}</strong> en{" "}
        <strong>{formatCurrency(optim, report.baseCurrency)}</strong> kunnen
        staan (neutraal:{" "}
        <strong>{formatCurrency(neutral, report.baseCurrency)}</strong>).
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        Echte uitkomsten worden bepaald door sequence-of-returns, inflatie en
        wereldgebeurtenissen. Dit is een referentie, geen voorspelling.
      </p>
    </div>
  );
}

function ExportBlock({ report }: { report: WealthDashboardReport }) {
  const markdown = buildMarkdownSummary(report);
  return (
    <div className="space-y-2">
      <pre className="max-h-64 overflow-auto rounded-md border border-border/40 bg-muted/10 p-3 text-[11px] text-muted-foreground whitespace-pre-wrap">
        {markdown}
      </pre>
      <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <Download className="h-3 w-3" /> Selecteer + kopieer (Ctrl/Cmd-C) voor je
        eigen administratie.
      </p>
    </div>
  );
}

function buildMarkdownSummary(report: WealthDashboardReport): string {
  const lines = [
    `# Wealth Dashboard — ${report.generatedAt.slice(0, 10)}`,
    "",
    `**Portfolio**: ${formatCurrency(report.totalValue, report.baseCurrency)}`,
    `**Op koers**: ${courseLabel(report.course.status)} (${report.course.achievableGoals}/${report.course.totalGoals} doelen)`,
    "",
    `## 10-jaars projectie`,
    `- Pessimistisch (${(report.projection.scenarios.pessimistic.annualReturn * 100).toFixed(1)}%/jr): ${formatCurrency(report.projection.scenarios.pessimistic.finalValue, report.baseCurrency)}`,
    `- Neutraal (${(report.projection.scenarios.neutral.annualReturn * 100).toFixed(1)}%/jr): ${formatCurrency(report.projection.scenarios.neutral.finalValue, report.baseCurrency)}`,
    `- Optimistisch (${(report.projection.scenarios.optimistic.annualReturn * 100).toFixed(1)}%/jr): ${formatCurrency(report.projection.scenarios.optimistic.finalValue, report.baseCurrency)}`,
    "",
    `## Maandelijkse discipline (${report.discipline.month})`,
    `- Ingelegd: ${formatCurrency(report.discipline.contributedThisMonth, report.baseCurrency)}`,
    `- Gepland: ${formatCurrency(report.discipline.plannedMonthly, report.baseCurrency)}`,
    `- Delta: ${report.discipline.delta >= 0 ? "+" : ""}${formatCurrency(report.discipline.delta, report.baseCurrency)} (${report.discipline.onTrack ? "op koers" : "achterstand"})`,
    "",
    `## Drift`,
    `- Alignment-score: ${report.drift.alignmentScore}/100`,
    `- Significante afwijkingen (>2pp): ${report.drift.significantDrifts}`,
    ...report.drift.topRows.map(
      (r) =>
        `- ${r.ticker}: ${(r.currentWeight * 100).toFixed(1)}% (target ${(r.targetWeight * 100).toFixed(1)}%, Δ ${(r.deltaWeight * 100).toFixed(1)}pp)`,
    ),
    "",
  ];
  if (report.dividendIncome) {
    lines.push(
      `## Verwachte dividend-inkomen`,
      `- Jaarlijks: ${formatCurrency(report.dividendIncome.annualGross, report.baseCurrency)}`,
      `- Gewogen yield: ${(report.dividendIncome.weightedYield * 100).toFixed(2)}%`,
      "",
    );
  }
  lines.push(`> ${report.disclaimer}`);
  return lines.join("\n");
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CheckCircle2;
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </p>
      <p className="mt-1 font-mono text-base font-bold text-foreground">
        {value}
      </p>
    </div>
  );
}

// ============================================================
//  Helpers
// ============================================================

function courseLabel(status: WealthCourseStatus): string {
  switch (status) {
    case "on_track":
      return "Op koers";
    case "mostly_on_track":
      return "Grotendeels op koers";
    case "at_risk":
      return "Onder druk";
    case "off_track":
      return "Buiten koers";
    case "no_goals":
      return "Geen doelen ingesteld";
  }
}

function courseTone(status: WealthCourseStatus): string {
  switch (status) {
    case "on_track":
      return "border-emerald-500/40 bg-emerald-500/5";
    case "mostly_on_track":
      return "border-emerald-500/30 bg-emerald-500/5";
    case "at_risk":
      return "border-amber-500/40 bg-amber-500/5";
    case "off_track":
      return "border-rose-500/40 bg-rose-500/5";
    case "no_goals":
      return "border-border/40";
  }
}

function courseToBadge(status: WealthCourseStatus): string {
  return courseTone(status).replace("bg-", "bg-").replace("border-", "border-");
}

function tierToBadge(tier: string): string {
  if (tier === "ON_TRACK")
    return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
  if (tier === "ACHIEVABLE")
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (tier === "AT_RISK")
    return "border-amber-500/40 bg-amber-500/10 text-amber-300";
  return "border-rose-500/40 bg-rose-500/10 text-rose-300";
}

function formatCurrency(amount: number, currency: string): string {
  if (!Number.isFinite(amount)) return "—";
  try {
    return new Intl.NumberFormat("nl-NL", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${Math.round(amount)} ${currency}`;
  }
}
