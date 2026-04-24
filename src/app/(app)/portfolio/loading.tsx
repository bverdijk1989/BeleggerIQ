import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Skeleton-loader voor /portfolio. Spiegelt de daadwerkelijke layout
 * (page header → 4 metric cards → tabel) zodat het overgangsmoment
 * rustig aanvoelt.
 */

export default function PortfolioLoading() {
  return (
    <>
      <PageHeader
        eyebrow="Analyse"
        title="Portefeuille"
        description="Bezig met ophalen van marktdata en factor scores…"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="flex flex-col gap-3 p-5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-7 w-32" />
              <Skeleton className="h-3 w-40" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          <Skeleton className="h-4 w-32" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="hidden h-4 w-12 md:block" />
              <Skeleton className="hidden h-4 w-12 lg:block" />
              <Skeleton className="hidden h-4 w-12 lg:block" />
              <Skeleton className="hidden h-4 w-12 lg:block" />
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
