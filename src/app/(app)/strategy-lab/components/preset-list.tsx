"use client";

import Link from "next/link";
import { useTransition } from "react";
import { PlusCircle, Sparkles, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { StrategyPresetRow } from "@/lib/data/strategy-preset-repository";
import { cn } from "@/lib/utils";

import { deletePreset } from "../actions";

interface PresetListProps {
  presets: StrategyPresetRow[];
  activeSlug: string | null;
  demoEmail: string;
}

/**
 * Sidebar met alle presets. Eigen presets krijgen een delete-knop;
 * publieke presets zijn alleen te gebruiken als startpunt ("Dupliceer").
 */
export function PresetList({ presets, activeSlug, demoEmail: _demoEmail }: PresetListProps) {
  const publicPresets = presets.filter((p) => p.isPublic);
  const ownPresets = presets.filter((p) => !p.isPublic);

  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-col gap-4 p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Presets
            </p>
            <p className="text-xs text-muted-foreground">
              Publieke templates + eigen strategieën.
            </p>
          </div>
          <Button size="sm" variant="outline" asChild>
            <Link href="/strategy-lab">
              <PlusCircle className="h-3.5 w-3.5" />
              Nieuw
            </Link>
          </Button>
        </div>

        <div className="space-y-3 overflow-y-auto">
          <Group title="Eigen">
            {ownPresets.length === 0 ? (
              <p className="rounded-md border border-dashed border-border/60 bg-surface/40 p-3 text-xs text-muted-foreground">
                Nog geen eigen presets — start met een publieke template of
                bouw er zelf één.
              </p>
            ) : (
              <ul className="space-y-1">
                {ownPresets.map((preset) => (
                  <PresetRow
                    key={preset.id}
                    preset={preset}
                    active={preset.slug === activeSlug}
                    canDelete
                  />
                ))}
              </ul>
            )}
          </Group>

          <Group title="Publiek">
            {publicPresets.length === 0 ? (
              <p className="rounded-md border border-dashed border-border/60 bg-surface/40 p-3 text-xs text-muted-foreground">
                Geen publieke templates beschikbaar.
              </p>
            ) : (
              <ul className="space-y-1">
                {publicPresets.map((preset) => (
                  <PresetRow
                    key={preset.id}
                    preset={preset}
                    active={preset.slug === activeSlug}
                  />
                ))}
              </ul>
            )}
          </Group>
        </div>
      </CardContent>
    </Card>
  );
}

function Group({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        {title}
      </p>
      {children}
    </div>
  );
}

function PresetRow({
  preset,
  active,
  canDelete = false,
}: {
  preset: StrategyPresetRow;
  active: boolean;
  canDelete?: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  const handleDelete = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!confirm(`Preset "${preset.name}" verwijderen?`)) return;
    startTransition(async () => {
      await deletePreset(preset.id);
    });
  };

  return (
    <li>
      <Link
        href={`/strategy-lab?preset=${encodeURIComponent(preset.slug)}`}
        className={cn(
          "flex items-start justify-between gap-2 rounded-md border px-3 py-2 text-left transition-colors",
          active
            ? "border-primary/40 bg-primary/10"
            : "border-border/60 bg-surface hover:bg-surface-elevated/60",
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p
              className={cn(
                "truncate text-sm font-medium",
                active ? "text-primary" : "text-foreground",
              )}
            >
              {preset.name}
            </p>
            {preset.isPublic && (
              <Sparkles className="h-3 w-3 text-primary" />
            )}
          </div>
          <p className="truncate text-[11px] text-muted-foreground">
            {preset.description || preset.type.toLowerCase()}
          </p>
        </div>
        {canDelete && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            className="text-muted-foreground transition-colors hover:text-destructive"
            aria-label="Verwijderen"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </Link>
    </li>
  );
}
