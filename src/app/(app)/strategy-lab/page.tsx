import { FlaskConical, ShieldAlert } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Section } from "@/components/common/section";
import { resolveUserFromServer } from "@/lib/auth";
import { strategyPresetRepository } from "@/lib/data/strategy-preset-repository";

import type { SavePresetActionInput } from "./actions";
import { ConfigForm } from "./components/config-form";
import { PresetList } from "./components/preset-list";

export const metadata = {
  title: "Strategy Lab",
};

export const dynamic = "force-dynamic";

interface StrategyLabPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const DEFAULT_CONFIG: SavePresetActionInput = {
  name: "",
  description: "",
  rebalance: "monthly",
  maxPositions: 10,
  maxPositionWeight: 0.15,
  factorWeights: {
    quality: 0.3,
    value: 0.25,
    momentum: 0.25,
    lowVol: 0.2,
  },
  toggles: {
    requireDividend: false,
    defensiveOverlay: false,
    useMomentum: true,
  },
  limits: {
    maxSectorWeight: 0.35,
  },
};

export default async function StrategyLabPage({
  searchParams,
}: StrategyLabPageProps) {
  const auth = await resolveUserFromServer();
  if (!auth.ok) {
    return (
      <>
        <PageHeader
          eyebrow="Onderzoek"
          title="Strategy Lab"
          description="Authenticatie vereist."
        />
        <EmptyState icon={ShieldAlert} title="Niet ingelogd" description={auth.error} />
      </>
    );
  }

  const params = await searchParams;
  const slug =
    typeof params.preset === "string" ? params.preset : undefined;

  const [presets, current] = await Promise.all([
    strategyPresetRepository.listForUserEmail(auth.user.email).catch(() => []),
    slug
      ? strategyPresetRepository.findBySlug(slug).catch(() => null)
      : Promise.resolve(null),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Onderzoek"
        title="Strategy Lab"
        description="Bouw en bewaar eigen factor-strategieën. Presets zijn direct bruikbaar in de backtest."
      />

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-20 lg:self-start">
          <PresetList
            presets={presets}
            activeSlug={current?.slug ?? null}
            demoEmail={auth.user.email}
          />
        </div>

        <div className="space-y-4">
          {presets.length === 0 && !current ? (
            <Section
              title="Begin met een nieuwe preset"
              description="Er zijn nog geen publieke templates geladen."
            >
              <EmptyState
                icon={FlaskConical}
                title="Lab is leeg"
                description="Draai `npm run prisma:seed` voor de publieke presets, of bouw er zelf één."
              />
              <ConfigForm current={null} defaults={DEFAULT_CONFIG} />
            </Section>
          ) : (
            <Section
              title={current ? `Preset: ${current.name}` : "Nieuwe preset"}
              description={
                current
                  ? "Pas gewichten, overlays en limits aan — bewaar als nieuwe of update bestaande."
                  : "Stel gewichten, overlays en limits in voor een eigen strategie."
              }
            >
              <ConfigForm current={current} defaults={DEFAULT_CONFIG} />
            </Section>
          )}

          <Section
            title="Hoe dit werkt"
            description="Strategy Lab bouwt dezelfde ranking als de ingebouwde strategieën."
          >
            <div className="rounded-md border border-border/60 bg-surface/60 p-4 text-sm text-muted-foreground">
              Factor-gewichten bepalen hoe zwaar Quality, Value, Momentum en
              Risk penalty meetellen in de ranking. Overlays zoals dividend-filter
              en defensieve buffer worden boven op de rangschikking gezet.
              Limits garanderen dat geen enkele positie of sector boven de
              opgegeven cap uitkomt. Na opslaan verschijnt je preset in de
              backtest-dropdown en draait hij tegen hetzelfde universum als de
              standaardstrategieën.
            </div>
          </Section>
        </div>
      </div>
    </>
  );
}
