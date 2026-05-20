import { Mail, ShieldAlert, ShieldCheck } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Section } from "@/components/common/section";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { loadMonthlyReview } from "@/lib/email-review";
import { resolveUserFromServer } from "@/lib/auth";
import { portfolioRepository } from "@/lib/data";
import { prisma } from "@/lib/data/prisma";
import { parsePreferences } from "@/lib/notifications/preferences";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Maandelijkse review",
};

export const dynamic = "force-dynamic";

/**
 * /maandreview — in-app preview van de Monthly Investor Review (Module 34).
 *
 * Toont exact wat de gebruiker per e-mail zou ontvangen + de huidige
 * e-mail-voorkeuren. Geen entitlement-gate.
 */
export default async function MonthlyReviewPreviewPage() {
  const auth = await resolveUserFromServer();
  if (!auth.ok) {
    return (
      <>
        <PageHeader
          eyebrow="E-mail"
          title="Maandelijkse review"
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

  // Lees huidige e-mail-voorkeuren.
  const ctx = await portfolioRepository
    .findUserContextByEmail(auth.user.email)
    .catch(() => null);
  let monthlyReviewOn = true;
  let detailedFigures = false;
  if (ctx?.userId) {
    const profile = await prisma.userProfile
      .findUnique({
        where: { userId: ctx.userId },
        select: { notifications: true },
      })
      .catch(() => null);
    const prefs = parsePreferences(profile?.notifications);
    monthlyReviewOn = prefs.monthlyReview;
    detailedFigures = prefs.monthlyReviewDetailedFigures;
  }

  const baseUrl =
    process.env.APP_BASE_URL ?? "https://beleggeriq.aegiscore.nl";

  const result = await loadMonthlyReview({
    userEmail: auth.user.email,
    greetingName: null,
    detailedFigures,
    baseUrl,
  });

  const review = result.data;

  return (
    <>
      <PageHeader
        eyebrow="E-mail"
        title="Maandelijkse review"
        description="Dit is precies wat je per e-mail ontvangt — privacy-veilige samenvatting, geen koop/verkoop-advies."
        actions={
          <Badge
            variant="outline"
            className={cn(
              "text-[10px]",
              monthlyReviewOn
                ? "border-emerald-500/40 text-emerald-300"
                : "border-muted-foreground/30 text-muted-foreground",
            )}
          >
            {monthlyReviewOn ? "E-mail AAN" : "E-mail UIT"}
          </Badge>
        }
      />

      <Section
        title="E-mail-voorkeuren"
        description="Bepaal wat je ontvangt. Pas dit aan via je profiel-instellingen."
      >
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <PreferenceRow
            label="Maandelijkse review per e-mail"
            value={monthlyReviewOn}
            onCopy="Je ontvangt elke maand een korte review-mail."
            offCopy="Je ontvangt geen maandelijkse review."
          />
          <PreferenceRow
            label="Gedetailleerde cijfers in e-mail"
            value={detailedFigures}
            onCopy="E-mail mag exacte cijfers en bedragen tonen."
            offCopy="E-mail toont alleen privacy-veilige samenvattingen (default)."
          />
        </div>
      </Section>

      {review ? (
        <Section
          title={`Preview · ${review.periodLabel}`}
          description={review.headline}
        >
          <Card className="border-border/60">
            <CardContent className="space-y-3 p-5">
              <p className="text-sm text-foreground">
                Hallo {review.greetingName},
              </p>
              {review.sections.map((s) => (
                <div
                  key={s.key}
                  className={cn(
                    "rounded-md border-l-2 bg-surface/40 p-3",
                    toneBorder(s.tone),
                  )}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {s.label}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {s.body}
                  </p>
                </div>
              ))}
              <p className="border-t border-border/40 pt-3 text-[11px] text-muted-foreground">
                {review.disclaimer}
              </p>
            </CardContent>
          </Card>
        </Section>
      ) : (
        <EmptyState
          icon={Mail}
          title="Nog geen review"
          description="Voeg posities toe — daarna verschijnt hier je eerste review."
        />
      )}

      <Section
        title="Privacy"
        description="Wat staat er wel en niet in de e-mail."
      >
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-4 text-xs text-emerald-100">
          <p className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              De e-mail bevat standaard <strong>geen bedragen</strong> en{" "}
              <strong>geen exacte portfolio-waarde</strong> — alleen
              grades, score-deltas en kwalitatieve labels. Exacte cijfers
              verschijnen alleen wanneer je &quot;gedetailleerde cijfers&quot;
              expliciet aanzet. Elke e-mail bevat een uitschrijf-link.
            </span>
          </p>
        </div>
      </Section>
    </>
  );
}

function PreferenceRow({
  label,
  value,
  onCopy,
  offCopy,
}: {
  label: string;
  value: boolean;
  onCopy: string;
  offCopy: string;
}) {
  return (
    <div className="rounded-md border border-border/60 bg-surface/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <Badge
          variant="outline"
          className={cn(
            "text-[10px]",
            value
              ? "border-emerald-500/40 text-emerald-300"
              : "border-muted-foreground/30 text-muted-foreground",
          )}
        >
          {value ? "AAN" : "UIT"}
        </Badge>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {value ? onCopy : offCopy}
      </p>
    </div>
  );
}

function toneBorder(tone: string): string {
  switch (tone) {
    case "positive":
      return "border-emerald-500/50";
    case "warning":
      return "border-amber-500/50";
    case "info":
      return "border-sky-500/50";
    default:
      return "border-border/60";
  }
}
