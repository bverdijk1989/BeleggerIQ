import type { Currency } from "@/types/common";
import type { AssetClass } from "@/types/portfolio";

/**
 * Statisch default-universum voor de screener. Bewust beperkt tot bekende
 * large-caps + enkele brede ETF's zodat dev-builds meteen een zinvol
 * resultaat tonen zonder externe universe-service. Vervang deze bron
 * zodra een echt data-abonnement is aangesloten (bv. FactSet, Refinitiv).
 */

export interface UniverseEntry {
  ticker: string;
  name: string;
  assetClass: AssetClass;
  sector: string;
  region: string;
  currency: Currency;
}

export const SUPPORTED_REGIONS = [
  "Europe",
  "North America",
  "UK",
  "Asia",
  "Global",
] as const;

export const SUPPORTED_SECTORS = [
  "Technology",
  "Healthcare",
  "Financials",
  "Consumer Staples",
  "Consumer Discretionary",
  "Communication Services",
  "Industrials",
  "Energy",
  "Materials",
  "Utilities",
  "Real Estate",
  "Diversified",
] as const;

export const DEFAULT_SCREENER_UNIVERSE: readonly UniverseEntry[] = [
  // Europe — NL
  {
    ticker: "ASML.AS",
    name: "ASML Holding",
    assetClass: "EQUITY",
    sector: "Technology",
    region: "Europe",
    currency: "EUR",
  },
  {
    ticker: "UNA.AS",
    name: "Unilever NV",
    assetClass: "EQUITY",
    sector: "Consumer Staples",
    region: "Europe",
    currency: "EUR",
  },
  {
    ticker: "ADYEN.AS",
    name: "Adyen",
    assetClass: "EQUITY",
    sector: "Financials",
    region: "Europe",
    currency: "EUR",
  },
  {
    ticker: "HEIA.AS",
    name: "Heineken",
    assetClass: "EQUITY",
    sector: "Consumer Staples",
    region: "Europe",
    currency: "EUR",
  },
  {
    ticker: "INGA.AS",
    name: "ING Groep",
    assetClass: "EQUITY",
    sector: "Financials",
    region: "Europe",
    currency: "EUR",
  },
  // Europe — other
  {
    ticker: "SAP.DE",
    name: "SAP",
    assetClass: "EQUITY",
    sector: "Technology",
    region: "Europe",
    currency: "EUR",
  },
  {
    ticker: "MC.PA",
    name: "LVMH",
    assetClass: "EQUITY",
    sector: "Consumer Discretionary",
    region: "Europe",
    currency: "EUR",
  },
  {
    ticker: "TTE.PA",
    name: "TotalEnergies",
    assetClass: "EQUITY",
    sector: "Energy",
    region: "Europe",
    currency: "EUR",
  },
  {
    ticker: "NESN.SW",
    name: "Nestlé",
    assetClass: "EQUITY",
    sector: "Consumer Staples",
    region: "Europe",
    currency: "CHF",
  },
  {
    ticker: "NOVN.SW",
    name: "Novartis",
    assetClass: "EQUITY",
    sector: "Healthcare",
    region: "Europe",
    currency: "CHF",
  },
  // UK
  {
    ticker: "SHEL.L",
    name: "Shell",
    assetClass: "EQUITY",
    sector: "Energy",
    region: "UK",
    currency: "GBP",
  },
  {
    ticker: "AZN.L",
    name: "AstraZeneca",
    assetClass: "EQUITY",
    sector: "Healthcare",
    region: "UK",
    currency: "GBP",
  },
  {
    ticker: "HSBA.L",
    name: "HSBC Holdings",
    assetClass: "EQUITY",
    sector: "Financials",
    region: "UK",
    currency: "GBP",
  },
  {
    ticker: "ULVR.L",
    name: "Unilever plc",
    assetClass: "EQUITY",
    sector: "Consumer Staples",
    region: "UK",
    currency: "GBP",
  },
  // North America
  {
    ticker: "MSFT",
    name: "Microsoft",
    assetClass: "EQUITY",
    sector: "Technology",
    region: "North America",
    currency: "USD",
  },
  {
    ticker: "AAPL",
    name: "Apple",
    assetClass: "EQUITY",
    sector: "Technology",
    region: "North America",
    currency: "USD",
  },
  {
    ticker: "NVDA",
    name: "Nvidia",
    assetClass: "EQUITY",
    sector: "Technology",
    region: "North America",
    currency: "USD",
  },
  {
    ticker: "GOOGL",
    name: "Alphabet",
    assetClass: "EQUITY",
    sector: "Communication Services",
    region: "North America",
    currency: "USD",
  },
  {
    ticker: "META",
    name: "Meta Platforms",
    assetClass: "EQUITY",
    sector: "Communication Services",
    region: "North America",
    currency: "USD",
  },
  {
    ticker: "AMZN",
    name: "Amazon",
    assetClass: "EQUITY",
    sector: "Consumer Discretionary",
    region: "North America",
    currency: "USD",
  },
  {
    ticker: "JNJ",
    name: "Johnson & Johnson",
    assetClass: "EQUITY",
    sector: "Healthcare",
    region: "North America",
    currency: "USD",
  },
  {
    ticker: "PG",
    name: "Procter & Gamble",
    assetClass: "EQUITY",
    sector: "Consumer Staples",
    region: "North America",
    currency: "USD",
  },
  {
    ticker: "JPM",
    name: "JPMorgan Chase",
    assetClass: "EQUITY",
    sector: "Financials",
    region: "North America",
    currency: "USD",
  },
  {
    ticker: "XOM",
    name: "ExxonMobil",
    assetClass: "EQUITY",
    sector: "Energy",
    region: "North America",
    currency: "USD",
  },
  {
    ticker: "PEP",
    name: "PepsiCo",
    assetClass: "EQUITY",
    sector: "Consumer Staples",
    region: "North America",
    currency: "USD",
  },
  // Diversified ETF's
  {
    ticker: "VWCE",
    name: "Vanguard FTSE All-World UCITS ETF",
    assetClass: "ETF",
    sector: "Diversified",
    region: "Global",
    currency: "EUR",
  },
  {
    ticker: "IWDA",
    name: "iShares Core MSCI World UCITS ETF",
    assetClass: "ETF",
    sector: "Diversified",
    region: "Global",
    currency: "EUR",
  },
] as const;
