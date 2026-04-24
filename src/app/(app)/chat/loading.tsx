import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Skeleton voor /chat. Context-chips bovenaan, lege bericht-kolom,
 * quick prompts en input onderaan.
 */
export default function ChatLoading() {
  return (
    <>
      <PageHeader
        eyebrow="Onderzoek"
        title="Chat"
        description="Context wordt geladen…"
      />
      <Card className="min-h-[640px]">
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-40 rounded-full" />
            ))}
          </div>
          <Skeleton className="h-[360px] w-full rounded-md" />
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-56 rounded-md" />
            ))}
          </div>
          <div className="flex gap-2 border-t border-border/60 pt-4">
            <Skeleton className="h-10 flex-1 rounded-md" />
            <Skeleton className="h-10 w-28 rounded-md" />
          </div>
        </CardContent>
      </Card>
    </>
  );
}
