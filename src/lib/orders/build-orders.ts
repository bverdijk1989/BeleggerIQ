/**
 * Pure builder: maandbeslissing-recommendations → manual-broker order rows.
 *
 * **Geen execution.** Deze module produceert alleen een tabel-vorm die
 * de gebruiker bij de broker (DEGIRO, Saxo, ABN AMRO, …) handmatig
 * invoert. Geen API-calls, geen MiFID-uitvoer, geen broker-koppeling.
 *
 * Filter: alleen `buy` / `add` / `sell` / `trim` produceren een order-rij.
 * `hold` (en alle non-action items zoals watch-only watchlist-tickers
 * die niet in `recommendations` zitten) worden expliciet weggelaten —
 * dat zijn geen orders die de gebruiker moet plaatsen.
 *
 * **Order type-suggestie:**
 *   - `buy` / `add` met een actief markt-segment (ETF / large-cap):
 *     `LIMIT @ ≤ quote × 1.005` (zorgt dat je niet boven huidige prijs
 *     wordt afgevuld bij thin liquidity).
 *   - `sell` / `trim`:
 *     `LIMIT @ ≥ quote × 0.995` (zelfde reden, andere richting).
 *   - Geen quote bekend → `MARKET (let op spread)` met expliciete waarschuwing.
 *
 * **Quantity-rounding:**
 *   - We gebruiken `Math.floor` voor BUY (nooit méér kopen dan budget toelaat)
 *     en `Math.floor` voor SELL (nooit méér verkopen dan we hebben — caller
 *     moet ervoor zorgen dat suggestedQuantity al ≤ huidige holding is).
 *   - Round-trip naar 0 → we filteren de rij weg ("amount te klein voor
 *     1 stuk"); dat geeft de UI een hint om budget te verhogen.
 */

export type OrderSide = "BUY" | "SELL";

export type OrderType = "LIMIT" | "MARKET";

export interface OrderRow {
  ticker: string;
  isin: string | null;
  name: string | null;
  side: OrderSide;
  /** Suggested cash-bedrag in basisvaluta (positief). */
  amount: number;
  /** Geschatte stuks; integer. */
  quantity: number;
  /** Laatste quote-prijs zoals bekend (kan null zijn). */
  latestQuote: number | null;
  /** Currency van de quote, bv. EUR / USD. */
  quoteCurrency: string | null;
  /** Voorgesteld order-type. */
  orderType: OrderType;
  /** Limit-prijs wanneer orderType=LIMIT. */
  limitPrice: number | null;
  /** Korte note voor de operator (bv. "let op spread"). */
  note: string | null;
}

interface RecommendationLike {
  ticker: string;
  name?: string | null;
  action: string; // "buy" | "add" | "hold" | "trim" | "sell"
  suggestedAmount: number;
  suggestedQuantity?: number | null;
}

interface QuoteLike {
  price: number;
  currency: string;
}

export interface BuildOrderListInput {
  recommendations: RecommendationLike[];
  /** ISIN-lookup (ticker → ISIN). Ontbreken → null in output. */
  isinByTicker?: Map<string, string | null>;
  /** Quote-lookup voor latestQuote + quantity-fallback. */
  quoteByTicker?: Map<string, QuoteLike>;
}

const SELL_ACTIONS = new Set(["sell", "trim"]);
const BUY_ACTIONS = new Set(["buy", "add"]);

/**
 * Round-trip: hoeveel stuks past nominaal in `amount`?
 * Math.floor zodat we nooit boven het bedrag uitkomen.
 */
function quantityFromAmount(amount: number, price: number | null): number {
  if (!price || price <= 0 || amount <= 0) return 0;
  return Math.floor(amount / price);
}

/**
 * 0.5%-padding op de limit. Bewust dunne marge: bij dikkere spreads
 * zou een 1% limit te vaak buiten de boekenstand vallen. De UI laat de
 * gebruiker 'em handmatig aanpassen vóór 'ie 'm intikt bij de broker.
 */
const LIMIT_PADDING = 0.005;

function roundPrice(value: number): number {
  return Math.round(value * 100) / 100;
}

export function buildOrderList(input: BuildOrderListInput): OrderRow[] {
  const out: OrderRow[] = [];

  for (const rec of input.recommendations) {
    const action = (rec.action ?? "").toLowerCase();
    const isBuy = BUY_ACTIONS.has(action);
    const isSell = SELL_ACTIONS.has(action);
    if (!isBuy && !isSell) continue; // hold / unknown → skip

    const quote = input.quoteByTicker?.get(rec.ticker) ?? null;
    const price = quote?.price ?? null;

    // Quantity priority: engine-supplied (already rounded) → from amount
    let quantity =
      typeof rec.suggestedQuantity === "number" &&
      Number.isFinite(rec.suggestedQuantity) &&
      rec.suggestedQuantity > 0
        ? Math.floor(rec.suggestedQuantity)
        : quantityFromAmount(rec.suggestedAmount, price);

    if (quantity <= 0) {
      // Geen zinnige order te plaatsen — sla 'em over (UI hint).
      continue;
    }
    quantity = Math.max(1, quantity);

    const orderType: OrderType = price ? "LIMIT" : "MARKET";
    const limitPrice = price
      ? roundPrice(
          isBuy ? price * (1 + LIMIT_PADDING) : price * (1 - LIMIT_PADDING),
        )
      : null;

    const note = price
      ? null
      : "Geen recente quote — controleer bid/ask vóór je een MARKET-order plaatst.";

    out.push({
      ticker: rec.ticker,
      isin: input.isinByTicker?.get(rec.ticker) ?? null,
      name: rec.name ?? null,
      side: isBuy ? "BUY" : "SELL",
      amount: Math.round(rec.suggestedAmount * 100) / 100,
      quantity,
      latestQuote: price,
      quoteCurrency: quote?.currency ?? null,
      orderType,
      limitPrice,
      note,
    });
  }

  return out;
}
