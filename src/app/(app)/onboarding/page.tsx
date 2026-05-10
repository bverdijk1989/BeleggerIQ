import {
  ArrowRight,
  Briefcase,
  CheckCircle2,
  Sparkles,
  TimerReset,
  UserCog,
} from "lucide-react";
import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";
import { resolveUserFromServer } from "@/lib/auth";
import { prisma } from "@/lib/data/prisma";
import { resolveServerLocale, t } from "@/lib/i18n";
import {
  computeProgressPercent,
  deriveOnboardingState,
} from "@/lib/onboarding/state";

import { CompleteButton } from "./components/complete-button";

export const metadata = {
  title: "Onboarding",
};

export const dynamic = "force-dynamic";

/**
 * Onboarding-flow MVP — drie stappen + complete-knop.
 *
 * **Server component**: leest user-context (profile/portfolios/snapshots/
 * onboardedAt) en berekent via `deriveOnboardingState()` welke stap
 * te tonen. UI is dom; geen client-side state-machine.
 *
 * **i18n-aware**: alle copy via `t(key, locale)`.
 *
 * **Niet in MVP** (eigen sprint):
 *  - Inline profile-wizard binnen de step-1-card (nu: link naar
 *    /profiel)
 *  - Inline DEGIRO-import binnen step-2 (nu: link naar /portfolio)
 *  - Auto-snapshot-trigger bij step-3 (nu: link naar /dashboard waar
 *    de SnapshotButton staat)
 *  - Per-step telemetry (zie M27 voor onboarding-funnel)
 */
export default async function OnboardingPage() {
  const auth = await resolveUserFromServer();
  if (!auth.ok) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-6 text-center">
        <h1 className="text-xl font-semibold">Onboarding</h1>
        <p className="text-sm text-muted-foreground">{auth.error}</p>
      </div>
    );
  }

  const locale = await resolveServerLocale();

  // Eén query, alles wat we nodig hebben.
  const user = await prisma.user.findUnique({
    where: { email: auth.user.email },
    select: {
      profile: { select: { id: true, onboardedAt: true } },
      portfolios: {
        select: {
          id: true,
          snapshots: { select: { id: true }, take: 1 },
        },
        take: 1,
      },
    },
  });

  const ctx = {
    hasProfile: Boolean(user?.profile),
    hasPortfolio: (user?.portfolios.length ?? 0) > 0,
    hasSnapshot:
      (user?.portfolios.flatMap((p) => p.snapshots).length ?? 0) > 0,
    onboardedAt: user?.profile?.onboardedAt ?? null,
  };
  const state = deriveOnboardingState(ctx);
  const progress = computeProgressPercent(state);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">
          {t("onboarding.welcome.title", locale)}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("onboarding.welcome.subtitle", locale)}
        </p>
        <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-surface">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${progress}%` }}
            aria-hidden
          />
        </div>
        <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          {state.completedSteps} / {state.totalSteps}
        </p>
      </header>

      <Step
        index={1}
        active={state.nextStep === "PROFILE"}
        done={state.completedSteps >= 1}
        icon={UserCog}
        title={t("onboarding.step1.title", locale)}
        description={t("onboarding.step1.description", locale)}
        href="/profiel"
        ctaLabel={t("common.continue", locale)}
      />

      <Step
        index={2}
        active={state.nextStep === "PORTFOLIO"}
        done={state.completedSteps >= 2}
        icon={Briefcase}
        title={t("onboarding.step2.title", locale)}
        description={t("onboarding.step2.description", locale)}
        href="/portfolio"
        ctaLabel={t("common.continue", locale)}
      />

      <Step
        index={3}
        active={state.nextStep === "SNAPSHOT"}
        done={state.completedSteps >= 3}
        icon={TimerReset}
        title={t("onboarding.step3.title", locale)}
        description={t("onboarding.step3.description", locale)}
        href="/dashboard"
        ctaLabel={t("common.continue", locale)}
      />

      {state.nextStep === "COMPLETE" && !state.isComplete && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="flex flex-col gap-3 p-5">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <p className="font-semibold text-foreground">
                {t("onboarding.complete", locale)}
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              {t("onboarding.complete_message", locale)}
            </p>
            <CompleteButton
              label={t("common.continue", locale)}
              redirectLabel={t("common.loading", locale)}
            />
          </CardContent>
        </Card>
      )}

      {state.isComplete && (
        <Card>
          <CardContent className="flex items-center gap-2 p-5 text-sm text-success">
            <CheckCircle2 className="h-4 w-4" />
            <span>{t("onboarding.complete_message", locale)}</span>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

interface StepProps {
  index: number;
  active: boolean;
  done: boolean;
  icon: typeof Briefcase;
  title: string;
  description: string;
  href: string;
  ctaLabel: string;
}

function Step({
  index,
  active,
  done,
  icon: Icon,
  title,
  description,
  href,
  ctaLabel,
}: StepProps) {
  return (
    <Card
      className={
        active
          ? "border-primary/50 bg-primary/5"
          : done
          ? "border-success/40 bg-success/5"
          : "opacity-70"
      }
    >
      <CardContent className="flex items-start gap-3 p-5">
        <span
          className={
            done
              ? "flex h-9 w-9 items-center justify-center rounded-md bg-success/15 text-success"
              : active
              ? "flex h-9 w-9 items-center justify-center rounded-md bg-primary/15 text-primary"
              : "flex h-9 w-9 items-center justify-center rounded-md bg-surface-elevated text-muted-foreground"
          }
        >
          {done ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
        </span>
        <div className="flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            #{index}
          </p>
          <p className="mt-0.5 text-base font-semibold text-foreground">
            {title}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          {active && (
            <Link
              href={href as never}
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              {ctaLabel}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
