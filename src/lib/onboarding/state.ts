/**
 * Onboarding state-machine — pure logica.
 *
 * Drie expliciete stappen + één "complete"-eindstaat:
 *   1. PROFILE      profielwizard (objective, riskTolerance, horizon)
 *   2. PORTFOLIO    portefeuille aanmaken (eventueel met DEGIRO-import)
 *   3. SNAPSHOT     één snapshot maken om de historiek te starten
 *   4. COMPLETE     onboardedAt-timestamp gezet
 *
 * **Pure function**: gegeven de huidige user-context (heeft profile?
 * heeft portfolio? heeft snapshot? onboardedAt set?) berekent 'em de
 * volgende step. Geen side effects.
 *
 * Caller (server component / route-handler) beslist wat te renderen
 * o.b.v. `nextStep`. UI is daarmee dom: zit op de juiste step zonder
 * eigen state te managen.
 */

export type OnboardingStep = "PROFILE" | "PORTFOLIO" | "SNAPSHOT" | "COMPLETE";

export interface OnboardingContext {
  /** Heeft de user al een UserProfile-record? */
  hasProfile: boolean;
  /** Heeft de user minstens één portefeuille? */
  hasPortfolio: boolean;
  /** Heeft de user minstens één PortfolioSnapshot? */
  hasSnapshot: boolean;
  /** UserProfile.onboardedAt — null = nog niet onboarded. */
  onboardedAt: Date | null;
}

export interface OnboardingState {
  /** Volgende step die de UI moet tonen. */
  nextStep: OnboardingStep;
  /** Aantal stappen voltooid (0..3). */
  completedSteps: number;
  /** Total steps voor progress-bar (vast 3). */
  totalSteps: 3;
  /** True wanneer de hele flow voltooid is. */
  isComplete: boolean;
}

const TOTAL_STEPS = 3 as const;

export function deriveOnboardingState(ctx: OnboardingContext): OnboardingState {
  // Wanneer onboardedAt expliciet gezet is, beschouw 'em altijd als
  // complete — ook als een latere data-cleanup een portfolio of snapshot
  // verwijderd zou hebben. Anders zou de gebruiker oneindig in een
  // herhalende onboarding zitten.
  if (ctx.onboardedAt) {
    return {
      nextStep: "COMPLETE",
      completedSteps: TOTAL_STEPS,
      totalSteps: TOTAL_STEPS,
      isComplete: true,
    };
  }

  if (!ctx.hasProfile) {
    return {
      nextStep: "PROFILE",
      completedSteps: 0,
      totalSteps: TOTAL_STEPS,
      isComplete: false,
    };
  }

  if (!ctx.hasPortfolio) {
    return {
      nextStep: "PORTFOLIO",
      completedSteps: 1,
      totalSteps: TOTAL_STEPS,
      isComplete: false,
    };
  }

  if (!ctx.hasSnapshot) {
    return {
      nextStep: "SNAPSHOT",
      completedSteps: 2,
      totalSteps: TOTAL_STEPS,
      isComplete: false,
    };
  }

  // Alle drie de prerequisites aanwezig maar onboardedAt nog niet
  // gezet → user moet de "klaar"-knop nog drukken.
  return {
    nextStep: "COMPLETE",
    completedSteps: TOTAL_STEPS,
    totalSteps: TOTAL_STEPS,
    isComplete: false,
  };
}

/**
 * Bouw een progress-percentage 0..100 voor UI-bars. Gebaseerd op
 * `completedSteps / totalSteps`.
 */
export function computeProgressPercent(state: OnboardingState): number {
  return Math.round((state.completedSteps / state.totalSteps) * 100);
}
