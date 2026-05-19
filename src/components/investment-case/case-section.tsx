import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  CircleHelp,
  HelpCircle,
  Lightbulb,
  ListChecks,
  Microscope,
  PieChart,
  Sparkles,
  Target,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CARD_LABELS,
  type InvestmentCase,
  type InvestmentCaseCard,
  type InvestmentCaseCardKey,
} from "@/lib/analytics/investment-case";
import { cn } from "@/lib/utils";

/**
 * Investment Case section — toont 8 cards in vaste volgorde.
 *
 * Pure presentational; engine-output bevat alle facts.
 */

interface InvestmentCaseSectionProps {
  caseData: InvestmentCase;
}

const CARD_ICONS: Record<
  InvestmentCaseCardKey,
  React.ComponentType<{ className?: string }>
> = {
  what_it_does: BookOpen,
  why_interesting: Sparkles,
  strengths: CheckCircle2,
  risks: AlertTriangle,
  signals_to_watch: Microscope,
  portfolio_fit: PieChart,
  missing_data: HelpCircle,
  conclusion: Target,
};

export function InvestmentCaseSection({
  caseData,
}: InvestmentCaseSectionProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        {caseData.cards.map((c) => (
          <CaseCard key={c.key} card={c} />
        ))}
      </div>
      <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-[11px] text-amber-100">
        <p className="flex items-start gap-2">
          <Lightbulb className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          <span>{caseData.disclaimer}</span>
        </p>
      </div>
    </div>
  );
}

function CaseCard({ card }: { card: InvestmentCaseCard }) {
  const Icon = CARD_ICONS[card.key] ?? ListChecks;
  return (
    <Card className={cn("border", qualityBorder(card.quality))}>
      <CardContent className="space-y-2 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Icon className={cn("h-4 w-4", qualityText(card.quality))} aria-hidden />
            {CARD_LABELS[card.key]}
          </p>
          <Badge variant="outline" className={cn("text-[10px]", qualityClass(card.quality))}>
            {qualityLabel(card.quality)}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">{card.body}</p>
        {card.bullets.length > 0 ? (
          <ul className="list-disc space-y-0.5 pl-5 text-xs text-foreground">
            {card.bullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        ) : null}
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
          bron: {card.source}
        </p>
      </CardContent>
    </Card>
  );
}

function qualityBorder(q: InvestmentCaseCard["quality"]): string {
  if (q === "solid") return "border-emerald-500/30";
  if (q === "partial") return "border-amber-500/30";
  return "border-rose-500/30";
}

function qualityClass(q: InvestmentCaseCard["quality"]): string {
  if (q === "solid") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
  if (q === "partial") return "border-amber-500/40 bg-amber-500/10 text-amber-200";
  return "border-rose-500/40 bg-rose-500/10 text-rose-200";
}

function qualityText(q: InvestmentCaseCard["quality"]): string {
  if (q === "solid") return "text-emerald-300";
  if (q === "partial") return "text-amber-300";
  return "text-rose-300";
}

function qualityLabel(q: InvestmentCaseCard["quality"]): string {
  if (q === "solid") return "Solide";
  if (q === "partial") return "Gedeeltelijk";
  return "Beperkt";
}
