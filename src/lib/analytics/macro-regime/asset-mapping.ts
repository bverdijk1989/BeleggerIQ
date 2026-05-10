/**
 * Asset-class mapping per regime.
 *
 * Voor elk van de 5 regimes: welke asset-klassen krijgen historisch een
 * tail-/headwind? De drempels zijn afgeleid uit Dalio/All-Weather +
 * decennia van marktdata-onderzoek.
 *
 * **Geen koop/verkoop-advies**: dit is een "wat-werkt-historisch"-tabel,
 * niet een orderbon. UI-laag noemt dit expliciet.
 *
 * Pure constant-table — wijziging vereist een PR met motivatie.
 */

import type {
  AssetClassImpact,
  AssetClassKey,
  AssetClassMapping,
  ImpactDirection,
  MacroRegime,
} from "./types";
import { ASSET_CLASS_LABELS } from "./types";

interface ImpactSpec {
  direction: ImpactDirection;
  /** 0..1 — sterkte van de tail-/headwind. */
  magnitude: number;
  rationale: string;
}

const TABLE: Record<MacroRegime, Partial<Record<AssetClassKey, ImpactSpec>>> = {
  GOLDILOCKS: {
    EQUITY_GROWTH: {
      direction: "tailwind",
      magnitude: 0.85,
      rationale: "Lage rente + winstgroei beloont multiple-expansion in growth.",
    },
    EQUITY_CYCLICAL: {
      direction: "tailwind",
      magnitude: 0.65,
      rationale: "Stijgende groei trekt cyclische winsten mee.",
    },
    EQUITY_VALUE: {
      direction: "neutral",
      magnitude: 0.3,
      rationale: "Value loopt mee maar blinkt vooral bij hogere inflatie.",
    },
    EQUITY_DEFENSIVE: {
      direction: "headwind",
      magnitude: 0.4,
      rationale: "Underperformance t.o.v. groei in een risk-on klimaat.",
    },
    BOND_GOVERNMENT: {
      direction: "neutral",
      magnitude: 0.2,
      rationale: "Yields kunnen licht stijgen; total return modest.",
    },
    BOND_CORPORATE: {
      direction: "tailwind",
      magnitude: 0.4,
      rationale: "Krappere credit spreads in een groei-omgeving.",
    },
    GOLD: {
      direction: "headwind",
      magnitude: 0.5,
      rationale: "Risk-on + lage inflatie verlaagt safe-haven-vraag.",
    },
    COMMODITIES: {
      direction: "neutral",
      magnitude: 0.3,
      rationale: "Vraag stijgt maar inflatie-druk is laag.",
    },
    CASH: {
      direction: "headwind",
      magnitude: 0.6,
      rationale: "Reële cash-rente nul/negatief; opportunity-cost hoog.",
    },
    REAL_ESTATE: {
      direction: "tailwind",
      magnitude: 0.55,
      rationale: "Lage rente + groei stuwt vastgoed-waarderingen.",
    },
  },

  REFLATION: {
    EQUITY_GROWTH: {
      direction: "headwind",
      magnitude: 0.5,
      rationale: "Stijgende rente zet druk op multiples van groeinamen.",
    },
    EQUITY_CYCLICAL: {
      direction: "tailwind",
      magnitude: 0.85,
      rationale: "Energie/materialen/financials profiteren van inflatie + groei.",
    },
    EQUITY_VALUE: {
      direction: "tailwind",
      magnitude: 0.75,
      rationale: "Klassieke 'value-rotation' bij hogere rentes.",
    },
    EQUITY_DEFENSIVE: {
      direction: "neutral",
      magnitude: 0.2,
      rationale: "Stabiele winsten, geen specifieke wind.",
    },
    BOND_GOVERNMENT: {
      direction: "headwind",
      magnitude: 0.7,
      rationale: "Yields stijgen → bond-prijzen dalen.",
    },
    BOND_CORPORATE: {
      direction: "headwind",
      magnitude: 0.4,
      rationale: "Spreads dalen, maar duration-pijn weegt zwaarder.",
    },
    GOLD: {
      direction: "neutral",
      magnitude: 0.2,
      rationale: "Inflatie helpt, maar reële rente kan tegenwerken.",
    },
    COMMODITIES: {
      direction: "tailwind",
      magnitude: 0.85,
      rationale: "Schaarste + vraag drijft grondstof-prijzen op.",
    },
    CASH: {
      direction: "neutral",
      magnitude: 0.3,
      rationale: "Hogere nominale rente, maar reële rente blijft beperkt.",
    },
    REAL_ESTATE: {
      direction: "tailwind",
      magnitude: 0.45,
      rationale: "Inflatie-doorberekening in huren bij commercieel vastgoed.",
    },
  },

  STAGFLATION: {
    EQUITY_GROWTH: {
      direction: "headwind",
      magnitude: 0.85,
      rationale: "Hoge rente + lage groei = dubbele tegenwind voor multiples.",
    },
    EQUITY_CYCLICAL: {
      direction: "headwind",
      magnitude: 0.7,
      rationale: "Cyclische winsten dalen met economische groei.",
    },
    EQUITY_VALUE: {
      direction: "neutral",
      magnitude: 0.2,
      rationale: "Geen duidelijke wind; selectie binnen value matters.",
    },
    EQUITY_DEFENSIVE: {
      direction: "tailwind",
      magnitude: 0.7,
      rationale: "Staples + healthcare leveren stabielere kasstromen.",
    },
    BOND_GOVERNMENT: {
      direction: "headwind",
      magnitude: 0.6,
      rationale: "Inflatie eet reëel rendement, ondanks vlucht-vraag.",
    },
    BOND_CORPORATE: {
      direction: "headwind",
      magnitude: 0.7,
      rationale: "Spreads wijden + duration-pijn samen.",
    },
    GOLD: {
      direction: "tailwind",
      magnitude: 0.85,
      rationale: "Klassieke stagflatie-hedge: inflatie + onzekerheid drijven goud.",
    },
    COMMODITIES: {
      direction: "tailwind",
      magnitude: 0.65,
      rationale: "Inflatie ondersteunt grondstoffen, mits vraaguitval beperkt blijft.",
    },
    CASH: {
      direction: "tailwind",
      magnitude: 0.55,
      rationale: "Nominale yields stijgen; cash als 'droog kruit' voor opportuniteit.",
    },
    REAL_ESTATE: {
      direction: "headwind",
      magnitude: 0.5,
      rationale: "Hogere financierings-kost weegt op vastgoed.",
    },
  },

  DEFLATION: {
    EQUITY_GROWTH: {
      direction: "neutral",
      magnitude: 0.3,
      rationale: "Lage rente helpt multiples, maar groei-vooruitzicht zwak.",
    },
    EQUITY_CYCLICAL: {
      direction: "headwind",
      magnitude: 0.85,
      rationale: "Vraaguitval drukt cyclische winsten zwaar.",
    },
    EQUITY_VALUE: {
      direction: "headwind",
      magnitude: 0.5,
      rationale: "Banken + energie zwak in deflatoire omgeving.",
    },
    EQUITY_DEFENSIVE: {
      direction: "tailwind",
      magnitude: 0.8,
      rationale: "Quality-namen leveren stabiliteit in een trage economie.",
    },
    BOND_GOVERNMENT: {
      direction: "tailwind",
      magnitude: 0.85,
      rationale: "Lange-rente-obligaties profiteren van dalende yields.",
    },
    BOND_CORPORATE: {
      direction: "neutral",
      magnitude: 0.3,
      rationale: "Duration helpt, maar credit risk verhoogt.",
    },
    GOLD: {
      direction: "neutral",
      magnitude: 0.4,
      rationale: "Lage reële rente helpt; geen inflatie-druk.",
    },
    COMMODITIES: {
      direction: "headwind",
      magnitude: 0.7,
      rationale: "Vraaguitval drukt grondstof-prijzen.",
    },
    CASH: {
      direction: "neutral",
      magnitude: 0.4,
      rationale: "Lage rente, maar koopkracht behouden bij deflatie.",
    },
    REAL_ESTATE: {
      direction: "headwind",
      magnitude: 0.6,
      rationale: "Vraaguitval + lagere huren wegen op vastgoed.",
    },
  },

  TRANSITIONAL: {
    // Bij transitional zetten we alles op neutral; gebruiker krijgt een
    // expliciete "geen sterke richting"-melding in de UI.
  },
};

const ALL_KEYS: AssetClassKey[] = [
  "EQUITY_GROWTH",
  "EQUITY_VALUE",
  "EQUITY_DEFENSIVE",
  "EQUITY_CYCLICAL",
  "BOND_GOVERNMENT",
  "BOND_CORPORATE",
  "GOLD",
  "COMMODITIES",
  "CASH",
  "REAL_ESTATE",
];

const NEUTRAL_DEFAULT: ImpactSpec = {
  direction: "neutral",
  magnitude: 0.2,
  rationale: "Geen uitgesproken regime-impact bekend.",
};

export function getAssetMappingForRegime(
  regime: MacroRegime,
): AssetClassMapping {
  const table = TABLE[regime];
  const impacts: AssetClassImpact[] = ALL_KEYS.map((key) => {
    const spec = table[key] ?? NEUTRAL_DEFAULT;
    return {
      assetClass: key,
      label: ASSET_CLASS_LABELS[key],
      direction: spec.direction,
      magnitude: spec.magnitude,
      rationale: spec.rationale,
    };
  });
  return { regime, impacts };
}
