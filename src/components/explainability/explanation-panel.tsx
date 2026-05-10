import {
  AlertCircle,
  CheckCircle2,
  Info,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import {
  TONE_STYLES,
  type CockpitTone,
} from "@/components/dashboard/decision-cockpit/tone";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DOMAIN_LABELS,
  type DomainExplanation,
  type ExplanationConfidence,
} from "@/lib/ai/explainability";
import { cn } from "@/lib/utils";

/**
 * ExplanationPanel — toont een `DomainExplanation` als gestructureerde
 * kaart met 6 secties:
 *   1. Conclusie (summary)
 *   2. Waarom belangrijk (whyItMatters)
 *   3. Positieve punten
 *   4. Risico's
 *   5. Mogelijke acties
 *   6. Onzekerheden / data
 *
 * Plus meta-laag: mode (ai/fallback) + provider + confidence + sources +
 * disclaimer. Bij `mode="fallback"` toont de UI een subtiele indicator;
 * de structuur blijft hetzelfde.
 */

interface Props {
  explanation: DomainExplanation;
  /** Optionele override van de titel — default = domain-label. */
  titleOverride?: string;
}

const CONFIDENCE_TONE: Record<ExplanationConfidence, CockpitTone> = {
  high: "good",
  medium: "neutral",
  low: "warning",
};

const CONFIDENCE_LABEL: Record<ExplanationConfidence, string> = {
  high: "Hoog",
  medium: "Medium",
  low: "Laag",
};

export function ExplanationPanel({ explanation, titleOverride }: Props) {
  const tone = CONFIDENCE_TONE[explanation.confidence];
  const styles = TONE_STYLES[tone];
  const isAi = explanation.mode === "ai";

  return (
    <Card className={cn("border", styles.container)}>
      <CardHeader className="space-y-1 pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Sparkles className={cn("h-4 w-4", styles.iconFg)} aria-hidden />
            {titleOverride ?? `Uitleg · ${DOMAIN_LABELS[explanation.domain]}`}
          </CardTitle>
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className="gap-1 text-[10px]">
              {isAi ? (
                <>
                  <Sparkles className="h-2.5 w-2.5" aria-hidden /> AI ·{" "}
                  {explanation.providerId}
                </>
              ) : (
                <>Fallback</>
              )}
            </Badge>
            <Badge variant="outline" className={cn("text-[10px]", styles.chip)}>
              Confidence: {CONFIDENCE_LABEL[explanation.confidence]}
            </Badge>
          </div>
        </div>
        <CardDescription className="text-xs leading-relaxed text-foreground">
          {explanation.summary}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4 text-xs">
        <Block title="Waarom dit belangrijk is" tone="neutral">
          <p className="leading-relaxed text-foreground">
            {explanation.whyItMatters}
          </p>
        </Block>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <BulletList
            title="Positieve punten"
            tone="good"
            items={explanation.positives}
            icon={TrendingUp}
            empty="Geen specifieke positieve punten gemeten."
          />
          <BulletList
            title="Risico's"
            tone="warning"
            items={explanation.risks}
            icon={TrendingDown}
            empty="Geen specifieke risico's gemeten."
          />
        </div>

        {/* Acties */}
        <Block title="Mogelijke acties" tone="neutral">
          {explanation.possibleActions.length === 0 ? (
            <p className="text-muted-foreground">Geen specifieke acties.</p>
          ) : (
            <ul className="space-y-2">
              {explanation.possibleActions.map((a, i) => (
                <li
                  key={i}
                  className="rounded-md border border-border/40 bg-background/30 p-2"
                >
                  <p className="font-medium text-foreground">
                    {a.link ? (
                      <a
                        href={a.link}
                        className="text-primary hover:underline"
                      >
                        {a.title}
                      </a>
                    ) : (
                      a.title
                    )}
                  </p>
                  <p className="mt-0.5 text-muted-foreground">{a.rationale}</p>
                </li>
              ))}
            </ul>
          )}
        </Block>

        {/* Onzekerheden */}
        <BulletList
          title="Onzekerheden / databeperkingen"
          tone="warning"
          items={explanation.uncertainties}
          icon={AlertCircle}
          empty="Geen materiële databeperkingen."
        />

        {/* Sources */}
        {explanation.sources.length > 0 && (
          <Block title="Brondata" tone="neutral">
            <ul className="space-y-0.5 text-[10px] text-muted-foreground">
              {explanation.sources.map((s) => (
                <li key={s.source}>
                  · {s.source}
                  {s.fields.length > 0 && (
                    <span> ({s.fields.slice(0, 3).join(", ")}
                      {s.fields.length > 3 ? "…" : ""})</span>
                  )}
                  {s.asOf && <span> · asOf {s.asOf.slice(0, 10)}</span>}
                </li>
              ))}
            </ul>
          </Block>
        )}

        {/* Disclaimer */}
        <p className="flex items-start gap-1 text-[10px] italic text-muted-foreground">
          <Info className="mt-0.5 h-2.5 w-2.5 shrink-0" />
          {explanation.disclaimer}
        </p>
      </CardContent>
    </Card>
  );
}

function Block({
  title,
  children,
  tone: _tone,
}: {
  title: string;
  children: React.ReactNode;
  tone: CockpitTone;
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function BulletList({
  title,
  tone,
  items,
  icon: Icon,
  empty,
}: {
  title: string;
  tone: CockpitTone;
  items: string[];
  icon: typeof TrendingUp;
  empty: string;
}) {
  const styles = TONE_STYLES[tone];
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </p>
      {items.length === 0 ? (
        <p className="mt-1 text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-1.5 space-y-1.5">
          {items.map((item, i) => (
            <li
              key={i}
              className={cn(
                "flex items-start gap-1.5 rounded-md border p-2",
                tone === "good"
                  ? "border-emerald-500/40 bg-emerald-500/5"
                  : tone === "warning"
                    ? "border-amber-500/40 bg-amber-500/5"
                    : "border-border/40 bg-surface/40",
              )}
            >
              <Icon
                className={cn("mt-0.5 h-3 w-3 shrink-0", styles.iconFg)}
                aria-hidden
              />
              <span className="text-foreground">{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Avoid eslint warning about unused `_tone` param.
void CONFIDENCE_TONE.high;
