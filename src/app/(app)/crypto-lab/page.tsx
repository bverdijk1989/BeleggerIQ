import {
  AlertTriangle,
  Coins,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Section } from "@/components/common/section";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buildPortfolioView } from "@/lib/analytics";
import {
  ALLOCATION_TIER_LABELS,
  CRYPTO_ASSET_LABELS,
  loadCryptoRiskReport,
  SIZING_TIER_LABELS,
  type CryptoAssetMetrics,
  type CryptoRiskReport,
  type SizingTier,
} from "@/lib/analytics/crypto-lab";
import { resolveUserFromServer } from "@/lib/auth";
import { portfolioRepository } from "@/lib/data";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Crypto Risk Lab",
};

export const dynamic = "force-dynamic";

/**
 * /crypto-lab — aparte lab-sectie voor crypto-gebruikers.
 *
 * Bewuste UX-keuze: dit is **geen** hoofd-route in de navigatie. Hier
 * laten we crypto-allocatie + volatiliteit + drawdown zien als
 * speculation-meter — geen koop-trigger, geen pump/dump.
 */

export default async function CryptoLabPage() {
  const auth = await resolveUserFromServer();
  if (!auth.ok) {
    return (
      <>
        <PageHeader
          eyebrow="Lab"
          title="Crypto Risk Lab"
          description="Authenticatie vereist."
        />
        <EmptyState icon={ShieldAlert} title="Niet ingelogd" description={auth.error} />
      </>
    );
  }

  const portfolio = await portfolioRepository
    .findPrimaryByEmail(auth.user.email)
    .catch(() => null);
  if (!portfolio) {
    return (
      <>
        <PageHeader
          eyebrow="Lab"
          title="Crypto Risk Lab"
          description="Voeg eerst een portefeuille toe om je crypto-exposure te zien."
        />
        <EmptyState
          icon={Coins}
          title="Geen portefeuille gevonden"
          description="Importeer of voeg een portefeuille toe via /portfolio."
        />
      </>
    );
  }

  const view = await buildPortfolioView(portfolio);
  const report = await loadCryptoRiskReport({
    portfolio,
    totalPortfolioValue: view.summary.totalValue,
  });

  return (
    <>
      <PageHeader
        eyebrow="Lab"
        title="Crypto Risk & Momentum Lab"
        description={`${ALLOCATION_TIER_LABELS[report.allocationTier]} · speculation-score ${report.speculationScore}/100`}
        actions={
          <Badge variant="outline" className="text-[10px]">
            v1: BTC + ETH
          </Badge>
        }
      />

      {/* Verplichte risico-banner */}
      <Section
        title="Risico-waarschuwing"
        description="Lees dit eerst — daarna de meetwaarden."
      >
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100">
          <p className="flex items-start gap-2">
            <AlertTriangle
              className="mt-0.5 h-4 w-4 shrink-0 text-amber-400"
              aria-hidden
            />
            <span>
              <strong className="text-amber-300">
                Je speculeert nu met hoog risico.
              </strong>{" "}
              {report.disclaimer}
            </span>
          </p>
        </div>
      </Section>

      {/* Allocatie + sizing */}
      <Section
        title="Crypto in je portefeuille"
        description="Hoe groot is de exposure t.o.v. je totale vermogen?"
      >
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <Stat
            label="Crypto-allocatie"
            value={`${(report.allocationFraction * 100).toFixed(1)}%`}
            sub={ALLOCATION_TIER_LABELS[report.allocationTier]}
          />
          <Stat
            label="Marktwaarde"
            value={formatCurrency(report.totalCryptoValue, "EUR")}
            sub={`${report.positions.length} positie${report.positions.length === 1 ? "" : "s"}`}
          />
          <Stat
            label="Speculation-score"
            value={`${report.speculationScore}/100`}
            sub="0 = bescheiden · 100 = zeer speculatief"
          />
        </div>

        <SizingCard report={report} />
      </Section>

      {/* Per-asset metrics */}
      {report.assets.length > 0 && (
        <Section
          title="Asset-metrics"
          description="Per asset: momentum, volatiliteit, drawdown — meetwaarden, geen koopsignaal."
        >
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {report.assets.map((m) => (
              <AssetCard key={m.asset} metrics={m} />
            ))}
          </div>
        </Section>
      )}

      {/* Posities */}
      {report.positions.length > 0 && (
        <Section
          title="Posities"
          description="Welke crypto-posities tellen mee in dit rapport."
        >
          <div className="grid grid-cols-1 gap-2">
            {report.positions.map((p) => (
              <div
                key={p.ticker}
                className="flex items-center justify-between rounded-md border border-border/40 bg-surface/40 p-3 text-sm"
              >
                <div>
                  <p className="font-semibold text-foreground">{p.ticker}</p>
                  <p className="text-xs text-muted-foreground">{p.name}</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm text-foreground">
                    {formatCurrency(p.marketValueBase, "EUR")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {(p.weight * 100).toFixed(1)}% van portfolio
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Warnings */}
      {report.warnings.length > 0 && (
        <Section
          title="Aandachtspunten"
          description="Expliciete waarschuwingen — geen advies, wel context."
        >
          <ul className="space-y-2">
            {report.warnings.map((w, i) => (
              <li
                key={i}
                className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-amber-200"
              >
                <AlertTriangle
                  className="mt-0.5 h-3 w-3 shrink-0"
                  aria-hidden
                />
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Niets — empty state */}
      {report.positions.length === 0 && (
        <EmptyState
          icon={Coins}
          title="Geen crypto-positie aanwezig"
          description="Voeg een crypto-positie toe via /portfolio (assetClass = CRYPTO) om dit rapport te zien werken. v1 dekt BTC + ETH."
        />
      )}

      <Section
        title="Methodologie"
        description="Hoe deze cijfers tot stand komen."
      >
        <div className="rounded-lg border border-border/60 bg-surface/40 p-4 text-xs text-muted-foreground">
          <p>
            <strong className="text-foreground">Momentum-score</strong>: combinatie van 12-mnd return (70%) + 30-dagen return (30%), geschaald naar 0..100.
          </p>
          <p className="mt-2">
            <strong className="text-foreground">Volatiliteit</strong>: dagelijkse log-returns std-dev × √252 (jaarlijks).
          </p>
          <p className="mt-2">
            <strong className="text-foreground">Max-drawdown</strong>: grootste piek-tot-dal-daling in 1y-window.
          </p>
          <p className="mt-2">
            <strong className="text-foreground">Speculation-score</strong>: 50% allocatie + 30% volatiliteit + 20% drawdown.
          </p>
          <p className="mt-2">
            <strong className="text-foreground">Wat we niet doen</strong>: koopadvies, leverage, pump/dump-signalen, gegarandeerde rendementen. Zie{" "}
            <code className="rounded bg-muted/30 px-1">docs/CRYPTO_RISK_LAB.md</code>{" "}
            voor formules en drempels.
          </p>
        </div>
      </Section>
    </>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-md border border-border/60 bg-surface/40 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-mono text-xl font-bold text-foreground">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

const SIZING_TIER_TONE: Record<SizingTier, string> = {
  comfortable: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  watch: "border-blue-500/40 bg-blue-500/10 text-blue-200",
  warning: "border-amber-500/40 bg-amber-500/10 text-amber-200",
  critical: "border-rose-500/40 bg-rose-500/10 text-rose-200",
};

function SizingCard({ report }: { report: CryptoRiskReport }) {
  return (
    <div
      className={cn(
        "mt-3 rounded-md border p-3 text-sm",
        SIZING_TIER_TONE[report.sizing.tier],
      )}
    >
      <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.15em]">
        <ShieldAlert className="h-3 w-3" aria-hidden />
        Sizing · {SIZING_TIER_LABELS[report.sizing.tier]}
      </p>
      <p className="mt-1 text-xs">{report.sizing.message}</p>
    </div>
  );
}

function AssetCard({ metrics }: { metrics: CryptoAssetMetrics }) {
  const trendIcon =
    metrics.trendDirection === "up"
      ? TrendingUp
      : metrics.trendDirection === "down"
        ? TrendingDown
        : null;
  return (
    <Card className="border border-border/60 bg-surface/40">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">
            {CRYPTO_ASSET_LABELS[metrics.asset]}
          </CardTitle>
          <Badge variant="outline" className="text-[10px]">
            data {metrics.dataQuality}
          </Badge>
        </div>
        <CardDescription className="text-xs">
          Sample {metrics.sampleSize} datapunten · trend{" "}
          {metrics.trendDirection}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <MetricRow
          label="Momentum"
          value={`${metrics.momentumScore}/100`}
        />
        <MetricRow
          label="12-mnd return"
          value={
            metrics.return12m !== null
              ? `${(metrics.return12m * 100).toFixed(1)}%`
              : "—"
          }
        />
        <MetricRow
          label="30-dgs return"
          value={
            metrics.return30d !== null
              ? `${(metrics.return30d * 100).toFixed(1)}%`
              : "—"
          }
        />
        <MetricRow
          label="Jaarvolatiliteit"
          value={
            metrics.annualizedVolatility !== null
              ? `${(metrics.annualizedVolatility * 100).toFixed(0)}%`
              : "—"
          }
        />
        <MetricRow
          label="Max-drawdown"
          value={
            metrics.maxDrawdown !== null
              ? `${(metrics.maxDrawdown * 100).toFixed(0)}%`
              : "—"
          }
        />
        <MetricRow
          label="Trend-sterkte"
          value={`${metrics.trendStrength}/100`}
          icon={trendIcon}
        />
      </CardContent>
    </Card>
  );
}

function MetricRow({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon?: typeof TrendingUp | null;
}) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1 font-mono text-foreground">
        {Icon && <Icon className="h-3 w-3" aria-hidden />}
        {value}
      </span>
    </div>
  );
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
