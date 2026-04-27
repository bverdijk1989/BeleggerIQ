"use client";

import { useEffect } from "react";
import { AlertOctagon, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/common/page-header";

/**
 * Error-boundary voor /dashboard.
 *
 * Een onverwachte fout in de Decision Cockpit (bijvoorbeeld een
 * gefaalde data-fetch of een engine-exception) mag de hele app niet
 * crashen. We tonen een rustige fallback met een retry-knop en (indien
 * beschikbaar) een digest-id voor debugging.
 *
 * Geen businesslogica — pure UI.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Logging gaat naar de server via de bestaande logger; hier alleen
    // console-fallback zodat in development de stack zichtbaar is.
    if (process.env.NODE_ENV !== "production") {
      console.error("[dashboard:error]", error);
    }
  }, [error]);

  return (
    <>
      <PageHeader
        eyebrow="Overzicht"
        title="Decision Cockpit"
        description="Er ging iets mis bij het laden van je cockpit."
      />
      <Card className="border-destructive/40 bg-destructive/5">
        <CardContent className="flex flex-col gap-3 p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-destructive/15 text-destructive">
              <AlertOctagon className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Cockpit niet beschikbaar
              </p>
              <p className="text-sm text-foreground">
                Eén van de engines kon niet laden. Probeer opnieuw of
                ververs de pagina. Je portefeuilledata blijft veilig.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => reset()}
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Opnieuw proberen
            </Button>
            {error.digest && (
              <span className="font-mono text-[10px] text-muted-foreground">
                Foutreferentie: {error.digest}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
