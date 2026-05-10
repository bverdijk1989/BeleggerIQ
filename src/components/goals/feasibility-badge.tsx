import { Badge } from "@/components/ui/badge";
import {
  TONE_STYLES,
  type CockpitTone,
} from "@/components/dashboard/decision-cockpit/tone";
import type { FeasibilityTier } from "@/lib/analytics/goals/types";
import { cn } from "@/lib/utils";

const TIER_TONE: Record<FeasibilityTier, CockpitTone> = {
  ON_TRACK: "good",
  ACHIEVABLE: "good",
  AT_RISK: "warning",
  UNLIKELY: "critical",
};

const TIER_LABEL: Record<FeasibilityTier, string> = {
  ON_TRACK: "Comfortabel haalbaar",
  ACHIEVABLE: "Haalbaar bij verwachte rendement",
  AT_RISK: "Onder druk",
  UNLIKELY: "Onwaarschijnlijk",
};

interface Props {
  tier: FeasibilityTier;
  className?: string;
}

export function FeasibilityBadge({ tier, className }: Props) {
  const tone = TIER_TONE[tier];
  const styles = TONE_STYLES[tone];
  return (
    <Badge variant="outline" className={cn("text-[10px]", styles.chip, className)}>
      {TIER_LABEL[tier]}
    </Badge>
  );
}

export { TIER_LABEL as FEASIBILITY_LABELS };
