/**
 * Cost-basis engine: FIFO (default) + LIFO (extension-ready).
 *
 * Doel: gegeven een chronologische lijst BUY/SELL voor één
 * (portfolio, ticker, currency)-combinatie, bereken realized PnL per
 * SELL en de remaining open lots.
 *
 * **Pure functie** — geen Prisma, geen Date.now. Caller groepeert
 * transacties per `ticker × currency` en geeft de tijd-gesorteerde
 * lijst hier in. Resultaat is reproduceerbaar voor jaarrapportage.
 *
 * Aannames (gedocumenteerd, niet impliciet):
 *
 *   1. **Per-currency boekhouding.** Realized PnL wordt **in de
 *      transactiemunt** gerapporteerd. Conversie naar EUR is een aparte
 *      stap (FX-rate van executedAt of from-FX-rij).
 *   2. **Fees opgenomen in cost-basis.** Een BUY van 5 stuks @ €600
 *      met €2 fee verhoogt de cost-basis tot €3002. Bij SELL trekken
 *      we proportionele fees af van de proceeds.
 *   3. **SELL meer dan we hebben** → markeer als `oversold`-error;
 *      we breken niet, maar resterende SELL-quantity gaat verloren in
 *      de PnL. Caller kan dit oppakken voor manual reconciliation.
 *   4. **ADJUSTMENT-rijen** worden hier genegeerd — die zijn cash-only.
 *      DIVIDEND/INTEREST/TAX/FEE komen pas voor in de yearly-summary,
 *      niet in deze engine.
 *
 * LIFO toevoegen: als `strategy: "LIFO"`, sluit lots in omgekeerde
 * volgorde (zelfde data-shape, andere `pop` vs `shift`).
 */

import type { ParsedTransaction } from "./types";

export type CostBasisStrategy = "FIFO" | "LIFO";

export interface OpenLot {
  /** ISO timestamp van de oorspronkelijke BUY. */
  openedAt: string;
  quantity: number;
  /** Per-stuk cost-basis incl. proportionele fee. */
  unitCost: number;
  /** Originele BUY-tx id voor audit-trail. */
  sourceTxId: string;
}

export interface RealizedTrade {
  closedAt: string;
  ticker: string;
  currency: string;
  quantity: number;
  /** Gemiddelde cost-basis van de gesloten lots. */
  costBasis: number;
  /** Gross proceeds (qty × price). */
  proceeds: number;
  /** Pro-rata fees aan close-side. */
  closingFee: number;
  /** = proceeds - costBasis - closingFee. */
  realizedPnl: number;
  sourceTxId: string;
}

export interface CostBasisResult {
  ticker: string;
  currency: string;
  realized: RealizedTrade[];
  openLots: OpenLot[];
  /** Oversold-event: SELL > beschikbare kwantiteit. */
  oversoldEvents: Array<{
    txId: string;
    closedAt: string;
    requested: number;
    available: number;
  }>;
}

export interface ComputeInput {
  ticker: string;
  currency: string;
  /** Alleen BUY/SELL voor deze ticker × currency. Wordt door de engine gesorteerd op executedAt. */
  transactions: Array<
    Pick<
      ParsedTransaction,
      "type" | "quantity" | "price" | "fee" | "executedAt"
    > & { id: string }
  >;
  strategy?: CostBasisStrategy;
}

/**
 * `id` op input-tx is verplicht zodat audit-trail terugkoppelt — de
 * caller (repository) genereert 'em uit Transaction.id of externalId.
 */
export function computeCostBasis(input: ComputeInput): CostBasisResult {
  const strategy = input.strategy ?? "FIFO";

  const sorted = [...input.transactions].sort(
    (a, b) => a.executedAt.getTime() - b.executedAt.getTime(),
  );

  const lots: OpenLot[] = [];
  const realized: RealizedTrade[] = [];
  const oversoldEvents: CostBasisResult["oversoldEvents"] = [];

  for (const tx of sorted) {
    if (tx.type !== "BUY" && tx.type !== "SELL") continue;
    const qty = tx.quantity;
    const price = tx.price;
    if (qty === null || qty === undefined || qty <= 0) continue;
    if (price === null || price === undefined) continue;
    const fee = tx.fee ?? 0;

    if (tx.type === "BUY") {
      // unitCost = (qty*price + fee) / qty
      const unitCost = (qty * price + fee) / qty;
      lots.push({
        openedAt: tx.executedAt.toISOString(),
        quantity: qty,
        unitCost,
        sourceTxId: tx.id,
      });
      continue;
    }

    // SELL — sluit lots aan FIFO/LIFO-zijde
    let remaining = qty;
    let costBasis = 0;
    let consumed = 0;

    while (remaining > 0 && lots.length > 0) {
      const lot = strategy === "FIFO" ? lots[0]! : lots[lots.length - 1]!;
      const take = Math.min(lot.quantity, remaining);
      costBasis += take * lot.unitCost;
      consumed += take;
      lot.quantity -= take;
      remaining -= take;
      if (lot.quantity <= 1e-12) {
        if (strategy === "FIFO") lots.shift();
        else lots.pop();
      }
    }

    const proceeds = consumed * price;
    // Pro-rata fee — als we maar 80% van de SELL-qty konden sluiten,
    // halen we ook 80% van de fee af. Resterende fee gaat verloren in
    // het oversold-pad maar dat is een edge-case.
    const closingFee = qty > 0 ? (consumed / qty) * fee : 0;
    const realizedPnl = proceeds - costBasis - closingFee;

    if (consumed > 0) {
      realized.push({
        closedAt: tx.executedAt.toISOString(),
        ticker: input.ticker,
        currency: input.currency,
        quantity: consumed,
        costBasis,
        proceeds,
        closingFee,
        realizedPnl,
        sourceTxId: tx.id,
      });
    }

    if (remaining > 0) {
      oversoldEvents.push({
        txId: tx.id,
        closedAt: tx.executedAt.toISOString(),
        requested: qty,
        available: consumed,
      });
    }
  }

  return {
    ticker: input.ticker,
    currency: input.currency,
    realized,
    openLots: lots,
    oversoldEvents,
  };
}
