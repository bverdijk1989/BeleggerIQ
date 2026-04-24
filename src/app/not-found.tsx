import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="max-w-md space-y-4 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          404
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Pagina niet gevonden
        </h1>
        <p className="text-sm text-muted-foreground">
          Deze route bestaat nog niet. Ga terug naar je dashboard om verder te gaan.
        </p>
        <Button asChild>
          <Link href="/dashboard">Naar dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
