import {
  AlertTriangle,
  Calendar,
  Coins,
  Info,
  ShieldAlert,
  Sparkles,
  TrendingUp,
} from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Section } from "@/components/common/section";
import { PaywallCard } from "@/components/entitlements/paywall-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  FREQUENCY_LABELS,
  MONTH_LABELS_NL,
  loadDividendReport,
  type DividendCalendarRow,
  type DividendDataQuality,
  type DividendReport,
  type DripSimulation,
} from "@/lib/analytics/dividend";
import { resolveUserFromServer } from "@/lib/auth";
import {
  canUseFeature,
  getFeature,
  resolveCurrentTier,
} from "@/lib/entitlements";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Dividend & DRIP",
};

export const dynamic = "force-dynamic";

/**
 * /dividend — Dividend Calendar & DRIP Simulator (Module 22).
 *
 * **Entitlement-laag**:
 *  - `dividend.calendar` is ALL_TIERS — iedereen ziet de kalender
 *  - `dividend.drip` is ALL_PAID — DRIP-simulator + 5/10/20-jaars
 *    projecties achter een paywall
 *
 * **Data-laag**: geen feed voor ex-dividend dates v1 — alle bedragen
 * zijn ESTIMATED (geschat) uit yield × marktwaarde. Distributie-
 * patronen via classifyFrequency-heuristiek (US-quarterly default).
 */
export default async function DividendPage() {
  const auth = await resolveUserFromServer();
  if (!auth.ok) {
    return (
      <>
        <PageHeader
          eyebrow="Inkomen"
          title="Dividend Calendar & DRIP"
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

  const tierResult = await resolveCurrentTier(auth.user.email);
  const calendarEntitlement = canUseFeature(
    tierResult.tier,
    "dividend.calendar",
    { overrideActive: tierResult.overrideActive },
  );
  const dripEntitlement = canUseFeature(
    tierResult.tier,
    "dividend.drip",
    { overrideActive: tierResult.overrideActive },
  );

  // Calendar zit op ALL_TIERS dus deze blijft toegankelijk; defensive.
  if (!calendarEntitlement.allowed) {
    const feature = getFeature("dividend.calendar")!;
    return (
      <>
        <PageHeader
          eyebrow="Inkomen"
          title="Dividend Calendar"
          description="Tijdslijn van verwachte uitkeringen."
        />
        <PaywallCard
          featureLabel={feature.label}
          description={feature.description}
          entitlement={calendarEntitlement}
        />
      </>
    );
  }

  const report = await loadDividendReport({ userEmail: auth.user.email });
  if (!report) {
    return (
      <>
        <PageHeader
          eyebrow="Inkomen"
          title="Dividend Calendar"
          description="Voeg een portefeuille toe om je verwachte inkomen te zien."
        />
        <EmptyState
          icon={Coins}
          title="Geen portefeuille"
          description="Importeer holdings of voeg posities toe via /portfolio."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Inkomen"
        title="Dividend Calendar & DRIP"
        description={`Verwacht jaarinkomen: ${formatCurrency(report.projection.annualGross, report.baseCurrency)} (gewogen yield ${(report.projection.weightedYield * 100).toFixed(2)}%)`}
        actions={
          <Badge variant="outline" className="text-[10px]">
            {report.projection.coveredPositions} posities dragen bij
          </Badge>
        }
      />

      {/* Waarschuwingen */}
      {report.warnings.length > 0 && (
        <Section
          title="Aandachtspunten"
          description="Data-kwaliteit + yield-trap-checks."
        >
          <ul className="space-y-2">
            {report.warnings.map((w, i) => (
              <li
                key={i}
                className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-200"
              >
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Calendar — 12 maanden */}
      <Section
        title="Dividend-kalender"
        description="Per maand verwacht totaal in base-currency. Bedragen zijn geschat (estimated) tenzij we een actuele feed hebben."
      >
        <MonthlyCalendar report={report} />
      </Section>

      {/* Per-positie breakdown */}
      <Section
        title="Per positie"
        description="Welke holdings dragen bij en in welke maanden."
      >
        <RowsTable rows={report.rows} currency={report.baseCurrency} />
      </Section>

      {/* Groei-analyse */}
      <Section
        title="Dividendgroei (5-jaars CAGR)"
        description={report.growth.summary}
      >
        <div className="rounded-md border border-border/40 bg-surface/40 p-3 text-sm">
          <p>
            <strong className="text-foreground">
              {report.growth.weighted5yGrowth !== null
                ? `${(report.growth.weighted5yGrowth * 100).toFixed(1)}%/jr`
                : "Geen data"}
            </strong>
            <span className="ml-2 text-xs text-muted-foreground">
              ({report.growth.coveredPositions} posities met groei-data)
            </span>
          </p>
        </div>
      </Section>

      {/* DRIP-simulator */}
      <Section
        title="DRIP-simulator (5/10/20 jaar)"
        description={
          dripEntitlement.allowed
            ? "Vergelijk herbeleggen aan/uit over drie horizons."
            : "Beschikbaar in Pro+ — herbeleggen vs. cash-out over 5/10/20 jaar."
        }
      >
        {dripEntitlement.allowed ? (
          <DripCards simulations={report.simulations} currency={report.baseCurrency} />
        ) : (
          <PaywallCard
            featureLabel={getFeature("dividend.drip")!.label}
            description={getFeature("dividend.drip")!.description}
            entitlement={dripEntitlement}
            bonusCopy="DRIP-aan compound je dividend mee — over 20 jaar kan dit het verschil zijn van 30%+ extra portfolio-waarde."
          />
        )}
      </Section>

      {dripEntitlement.allowed && (
        <Section
          title="Aannames (DRIP)"
          description="Wat de simulatie WEL en NIET modelleert."
        >
          <details className="rounded-md border border-border/40 bg-muted/10 p-3 text-xs">
            <summary className="cursor-pointer font-semibold text-muted-foreground">
              Toon aannames
            </summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
              {report.simulations[0]?.assumptions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          </details>
        </Section>
      )}

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

function MonthlyCalendar({ report }: { report: DividendReport }) {
  const monthMap = new Map(report.monthlyTotals.map((m) => [m.month, m.amount]));
  const max = Math.max(...Array.from(monthMap.values()), 1);
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
      {MONTH_LABELS_NL.map((label, idx) => {
        const month = idx + 1;
        const amount = monthMap.get(month) ?? 0;
        const fill = amount > 0 ? Math.max(8, (amount / max) * 100) : 0;
        return (
          <Card key={month} className="border-border/60 bg-surface/40">
            <CardContent className="space-y-1 p-3 text-center">
              <p className="flex items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                <Calendar className="h-3 w-3" /> {label}
              </p>
              <p className="font-mono text-sm font-bold text-foreground">
                {amount > 0
                  ? formatCurrency(amount, report.baseCurrency)
                  : "—"}
              </p>
              <div className="h-1 w-full overflow-hidden rounded-full bg-muted/30">
                <div
                  className={cn(
                    "h-full bg-emerald-500/60 transition-all",
                    amount === 0 && "bg-transparent",
                  )}
                  style={{ width: `${fill}%` }}
                  aria-hidden
                />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function RowsTable({
  rows,
  currency,
}: {
  rows: ReadonlyArray<DividendCalendarRow>;
  currency: string;
}) {
  const sorted = [...rows].sort(
    (a, b) => b.expectedAnnualGross - a.expectedAnnualGross,
  );
  return (
    <div className="space-y-2">
      {sorted.map((row) => (
        <div
          key={row.ticker}
          className="grid grid-cols-2 items-center gap-2 rounded-md border border-border/40 bg-surface/40 p-3 text-sm lg:grid-cols-5"
        >
          <div className="lg:col-span-2">
            <p className="font-semibold text-foreground">{row.ticker}</p>
            <p className="text-xs text-muted-foreground">{row.name}</p>
          </div>
          <div className="text-right lg:text-left">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Yield
            </p>
            <p className="font-mono text-xs text-foreground">
              {row.dividendYield !== null
                ? `${(row.dividendYield * 100).toFixed(2)}%`
                : "—"}
            </p>
          </div>
          <div className="text-right lg:text-left">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Jaarlijks
            </p>
            <p className="font-mono text-xs text-foreground">
              {formatCurrency(row.expectedAnnualGross, currency)}
            </p>
          </div>
          <div className="text-right">
            <Badge
              variant="outline"
              className={cn(
                "text-[10px]",
                dataQualityTone(row.dataQuality),
              )}
            >
              {row.dataQuality === "actual"
                ? "Actueel"
                : row.dataQuality === "estimated"
                  ? "Geschat"
                  : row.dataQuality === "low"
                    ? "Beperkt"
                    : "Geen data"}
            </Badge>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {FREQUENCY_LABELS[row.frequency]}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function DripCards({
  simulations,
  currency,
}: {
  simulations: ReadonlyArray<DripSimulation>;
  currency: string;
}) {
  return (
    <div className="space-y-4">
      {simulations.map((sim) => (
        <Card key={sim.horizonYears} className="border-border/60 bg-surface/40">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Sparkles className="h-4 w-4 text-primary" />
                Horizon: {sim.horizonYears} jaar
              </p>
              <Badge variant="outline" className="text-[10px]">
                Met vs zonder DRIP
              </Badge>
            </div>
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
              {(["conservative", "neutral", "optimistic"] as const).map(
                (scen) => (
                  <div
                    key={scen}
                    className="rounded-md border border-border/40 bg-background p-3"
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      {scen} ·{" "}
                      {(sim.withDrip[scen].annualReturn * 100).toFixed(1)}%/jr
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Met DRIP:{" "}
                      <span className="font-mono text-foreground">
                        {formatCurrency(sim.withDrip[scen].finalValue, currency)}
                      </span>
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Zonder DRIP:{" "}
                      <span className="font-mono text-muted-foreground">
                        {formatCurrency(
                          sim.withoutDrip[scen].finalValue,
                          currency,
                        )}
                      </span>
                    </p>
                    <p className="mt-1 text-[10px] text-emerald-300">
                      Δ +
                      {formatCurrency(
                        sim.withDrip[scen].finalValue -
                          sim.withoutDrip[scen].finalValue,
                        currency,
                      )}{" "}
                      door herbeleggen
                    </p>
                  </div>
                ),
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function dataQualityTone(q: DividendDataQuality): string {
  switch (q) {
    case "actual":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
    case "estimated":
      return "border-amber-500/40 bg-amber-500/10 text-amber-300";
    case "low":
      return "border-amber-500/30 bg-amber-500/10 text-amber-200";
    case "missing":
      return "border-border/40 bg-muted/20 text-muted-foreground";
  }
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
