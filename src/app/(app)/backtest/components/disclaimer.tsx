import { Info } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

/**
 * Vaste disclaimer onderaan /backtest. Bewust kalm en feitelijk — de backtest
 * is analytisch gereedschap, geen beleggingsadvies.
 */
export function Disclaimer() {
  return (
    <Card className="bg-surface/60">
      <CardContent className="flex items-start gap-3 p-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-elevated text-muted-foreground">
          <Info className="h-4 w-4" />
        </span>
        <div className="space-y-1 text-sm">
          <p className="font-medium text-foreground">Historische simulatie</p>
          <p className="text-muted-foreground">
            Deze cijfers komen uit een backtest op historische prijzen en statische
            factor-signalen. Rendementen uit het verleden bieden geen garantie
            voor de toekomst. Transactiekosten zijn benaderd via
            basispunten — geen spread of belasting. Gebruik het als
            analytisch gereedschap, niet als advies.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
