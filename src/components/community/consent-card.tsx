"use client";

import { ShieldCheck, Lock } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  updateCommunityConsentAction,
  revokeCommunityConsentAction,
} from "@/lib/community/actions";
import {
  CONSENT_SCOPE_DESCRIPTIONS,
  CONSENT_SCOPE_LABELS,
  CONSENT_SCOPE_ORDER,
  type CommunityConsent,
  type ConsentScope,
} from "@/lib/community/types";
import { cn } from "@/lib/utils";

interface Props {
  consent: CommunityConsent;
}

/**
 * ConsentCard — opt-in flow per scope.
 *
 * **UX-norm**: granulair, transparent, makkelijk in te trekken. Geen
 * "alles aan/alles uit"-trucs; default is uit.
 */
export function ConsentCard({ consent }: Props) {
  const [selected, setSelected] = useState<Set<ConsentScope>>(
    new Set(consent.scopes),
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(consent.updatedAt);

  function toggle(scope: ConsentScope) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(scope)) next.delete(scope);
      else next.add(scope);
      return next;
    });
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await updateCommunityConsentAction({
        scopes: Array.from(selected),
      });
      if (!res.ok) setError(res.error ?? "Kon niet opslaan");
      else setSavedAt(new Date().toISOString());
    });
  }

  function revokeAll() {
    setError(null);
    startTransition(async () => {
      const res = await revokeCommunityConsentAction();
      if (!res.ok) setError(res.error ?? "Kon niet intrekken");
      else {
        setSelected(new Set());
        setSavedAt(new Date().toISOString());
      }
    });
  }

  const dirty = !setsEqual(selected, new Set(consent.scopes));

  return (
    <div className="rounded-lg border border-border/60 bg-surface/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
            Privacy-instellingen
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Per scope zelf bepalen wat anoniem mag worden gedeeld voor cohort-
            vergelijking. Niets is standaard aan.
          </p>
        </div>
        <Badge variant="outline" className="text-[10px]">
          {selected.size}/{CONSENT_SCOPE_ORDER.length} actief
        </Badge>
      </div>

      <ul className="mt-4 space-y-2">
        {CONSENT_SCOPE_ORDER.map((scope) => {
          const checked = selected.has(scope);
          return (
            <li
              key={scope}
              className={cn(
                "rounded-md border px-3 py-2 transition-colors",
                checked
                  ? "border-primary/40 bg-primary/5"
                  : "border-border/40 bg-background/40",
              )}
            >
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(scope)}
                  className="mt-1 h-4 w-4 cursor-pointer"
                  disabled={pending}
                />
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {CONSENT_SCOPE_LABELS[scope]}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {CONSENT_SCOPE_DESCRIPTIONS[scope]}
                  </p>
                </div>
              </label>
            </li>
          );
        })}
      </ul>

      {error && (
        <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[10px] text-muted-foreground">
          {savedAt
            ? `Laatst opgeslagen: ${new Date(savedAt).toLocaleString("nl-NL")}`
            : "Nog geen toestemming gegeven."}
          <span className="ml-2 inline-flex items-center gap-1 text-muted-foreground/70">
            <Lock className="h-3 w-3" aria-hidden />
            geen tickers, namen of bedragen
          </span>
        </div>
        <div className="flex gap-2">
          {consent.scopes.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={revokeAll}
              disabled={pending}
            >
              Trek alle in
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            onClick={save}
            disabled={pending || !dirty}
          >
            {pending ? "Opslaan…" : "Bewaren"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}
