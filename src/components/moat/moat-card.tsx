import {
  AlertTriangle,
  CheckCircle2,
  Coins,
  Database,
  Gauge,
  HelpCircle,
  Landmark,
  Lightbulb,
  ShieldCheck,
  Sigma,
  Sparkles,
  TrendingUp,
  Wallet,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  COMPONENT_LABELS,
  type MoatComponent,
  type MoatComponentKey,
  type MoatGrade,
  type MoatReport,
} from "@/lib/analytics/moat-owner-earnings";
import { cn } from "@/lib/utils";

/**
 * Module 32 — Moat-card presentational.
 *
 * Composite-score boven, per-component breakdown daarna. Geen
 * entitlement-gate — kwaliteit-zicht is core voor langetermijnbelegger.
 */

interface MoatCardProps {
  report: MoatReport;
}

export function MoatCard({ report }: MoatCardProps) {
  return (
    <div className="space-y-3">
      <Card className={cn("border", gradeBorder(report.grade))}>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-baseline gap-3">
            <span className={cn("font-mono text-4xl font-bold", gradeText(report.grade))}>
              {report.compositeScore !== null ? `${report.compositeScore}` : "—"}
            </span>
            <span className="text-sm text-muted-foreground">/100</span>
            <Badge variant="outline" className={cn("ml-auto text-[10px]", gradeBadgeClass(report.grade))}>
              {gradeLabel(report.grade)}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">{report.headline}</p>
          <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
            <span>
              Datadekking: <strong className="font-mono text-foreground">{Math.round(report.coverage * 100)}%</strong>
            </span>
            <span>·</span>
            <span>
              Confidence:{" "}
              <strong className={cn("font-mono", confidenceTone(report.confidence))}>
                {confidenceLabel(report.confidence)}
              </strong>
            </span>
          </div>
        </CardContent>
      </Card>

      {report.warnings.length > 0 ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-200">
          <ul className="list-disc space-y-1 pl-5">
            {report.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {report.components.map((c) => (
          <ComponentCard key={c.key} component={c} />
        ))}
      </div>

      <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-[11px] text-amber-100">
        <p className="flex items-start gap-2">
          <Lightbulb className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          <span>{report.disclaimer}</span>
        </p>
      </div>
    </div>
  );
}

function ComponentCard({ component }: { component: MoatComponent }) {
  const Icon = iconForComponent(component.key);
  const isMissing = component.score === null;
  return (
    <Card
      className={cn(
        "border",
        isMissing ? "border-border/40 bg-muted/10" : scoreBorder(component.score!),
      )}
    >
      <CardContent className="space-y-1.5 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Icon className={cn("h-4 w-4", isMissing ? "text-muted-foreground" : scoreText(component.score!))} aria-hidden />
            {COMPONENT_LABELS[component.key]}
          </p>
          {isMissing ? (
            <Badge variant="outline" className="text-[10px] text-muted-foreground">
              Geen data
            </Badge>
          ) : (
            <Badge variant="outline" className={cn("text-[10px]", scoreBadgeClass(component.score!))}>
              {component.score}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{component.rationale}</p>
        {component.inputsMissing.length > 0 ? (
          <p className="text-[10px] text-muted-foreground/70">
            Ontbreekt: {component.inputsMissing.join(", ")}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ============================================================
//  Tone helpers
// ============================================================

function gradeLabel(g: MoatGrade): string {
  switch (g) {
    case "wide":
      return "Brede moat";
    case "narrow":
      return "Smalle moat";
    case "neutral":
      return "Neutraal";
    case "weak":
      return "Zwak";
    case "unknown":
      return "Onbekend";
  }
}

function gradeText(g: MoatGrade): string {
  if (g === "wide") return "text-emerald-200";
  if (g === "narrow") return "text-emerald-300";
  if (g === "neutral") return "text-foreground";
  if (g === "weak") return "text-rose-300";
  return "text-muted-foreground";
}

function gradeBorder(g: MoatGrade): string {
  if (g === "wide") return "border-emerald-500/40";
  if (g === "narrow") return "border-emerald-500/30";
  if (g === "neutral") return "border-border/60";
  if (g === "weak") return "border-rose-500/40";
  return "border-border/40";
}

function gradeBadgeClass(g: MoatGrade): string {
  if (g === "wide") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
  if (g === "narrow") return "border-emerald-500/30 bg-emerald-500/5 text-emerald-200";
  if (g === "neutral") return "border-border/60 text-foreground";
  if (g === "weak") return "border-rose-500/40 bg-rose-500/10 text-rose-200";
  return "border-muted-foreground/30 text-muted-foreground";
}

function scoreText(score: number): string {
  if (score >= 70) return "text-emerald-300";
  if (score >= 50) return "text-foreground";
  if (score >= 30) return "text-amber-300";
  return "text-rose-300";
}

function scoreBorder(score: number): string {
  if (score >= 70) return "border-emerald-500/30";
  if (score >= 50) return "border-border/60";
  if (score >= 30) return "border-amber-500/30";
  return "border-rose-500/30";
}

function scoreBadgeClass(score: number): string {
  if (score >= 70) return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
  if (score >= 50) return "border-border/60 text-foreground";
  if (score >= 30) return "border-amber-500/40 bg-amber-500/10 text-amber-200";
  return "border-rose-500/40 bg-rose-500/10 text-rose-200";
}

function confidenceLabel(c: MoatReport["confidence"]): string {
  if (c === "high") return "hoog";
  if (c === "medium") return "gemiddeld";
  if (c === "low") return "laag";
  return "onvoldoende";
}

function confidenceTone(c: MoatReport["confidence"]): string {
  if (c === "high") return "text-emerald-200";
  if (c === "medium") return "text-foreground";
  if (c === "low") return "text-amber-200";
  return "text-rose-200";
}

function iconForComponent(
  k: MoatComponentKey,
): React.ComponentType<{ className?: string }> {
  switch (k) {
    case "return_on_capital":
      return TrendingUp;
    case "fcf_quality":
      return Wallet;
    case "owner_earnings":
      return Coins;
    case "margin_stability":
      return Sigma;
    case "earnings_growth_quality":
      return Sparkles;
    case "debt_sustainability":
      return Landmark;
    case "dividend_safety":
      return ShieldCheck;
    case "pricing_power":
      return Gauge;
    case "moat_confidence":
      return CheckCircle2;
    case "data_coverage":
      return Database;
    default:
      return HelpCircle;
  }
}
