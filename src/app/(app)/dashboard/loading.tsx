import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Skeleton voor /dashboard — spiegelt de Decision Cockpit-layout:
 *   1. PageHeader
 *   2. Primary-action bar (3 actie-tegels)
 *   3. Status-snapshot (5 status-tegels)
 *   4. Risico's + Kansen (2 kolommen)
 *   5. Allocatie-simulatie + Scenario-blok (2 kolommen)
 *   6. AI Explain Panel (collapsed)
 *   7. Verdieping (regime + benchmark, business-quality, netto rendement)
 */
export default function DashboardLoading() {
  return (
    <>
      <PageHeader
        eyebrow="Overzicht"
        title="Decision Cockpit"
        description="Cockpit wordt opgebouwd…"
      />

      {/* Row 1: primary-action bar — 3 actie-tegels */}
      <Card>
        <CardContent className="space-y-3 p-5">
          <Skeleton className="h-3 w-48" />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-md" />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Row 2: status-snapshot — 5 compacte tegels */}
      <Card>
        <CardContent className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-md" />
          ))}
        </CardContent>
      </Card>

      {/* Row 3: risico's + kansen */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="space-y-3 p-5">
              <Skeleton className="h-3 w-40" />
              {Array.from({ length: 3 }).map((_, j) => (
                <Skeleton key={j} className="h-24 w-full rounded-md" />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Row 4: allocatie-simulatie + scenario */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <Card>
          <CardContent className="space-y-3 p-5">
            <Skeleton className="h-3 w-56" />
            <Skeleton className="h-5 w-72" />
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, j) => (
                <Skeleton key={j} className="h-10 w-full rounded-md" />
              ))}
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Skeleton className="h-24 w-full rounded-md" />
              <Skeleton className="h-24 w-full rounded-md" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-3 p-5">
            <Skeleton className="h-3 w-32" />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {Array.from({ length: 4 }).map((_, j) => (
                <Skeleton key={j} className="h-28 rounded-md" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 5: AI Explain Panel (collapsed) */}
      <Card>
        <CardContent className="space-y-3 p-5">
          <Skeleton className="h-3 w-44" />
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-9 w-44 rounded-md" />
        </CardContent>
      </Card>
    </>
  );
}
