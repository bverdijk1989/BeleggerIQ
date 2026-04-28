import { ShieldAlert } from "lucide-react";

import {
  TAX_DISCLAIMER_BODY,
  TAX_DISCLAIMER_TITLE,
} from "@/lib/tax/disclaimer";

/**
 * Prominent maar niet schreeuwerig — de disclaimer hoort top-of-page,
 * vóór elke cijferweergave, zodat een toevallige screenshot 'em altijd
 * mee-pakt.
 */
export function DisclaimerBanner() {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-md border border-warning/40 bg-warning/10 p-4 text-sm"
    >
      <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
      <div>
        <p className="font-semibold text-foreground">{TAX_DISCLAIMER_TITLE}</p>
        <p className="mt-1 text-muted-foreground">{TAX_DISCLAIMER_BODY}</p>
      </div>
    </div>
  );
}
