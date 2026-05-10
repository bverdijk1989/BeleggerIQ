/**
 * Report-spec builder — bouwt een `ReportSpec` voor toekomstige
 * PDF/Excel-export. **In v1 nog geen renderer**; wel het type-fundament
 * + tests zodat we de generatie-pijp kunnen wireup zonder later de
 * shape te moeten breken.
 */

import type { ISODateString } from "@/types/common";

import { selectDisclaimers } from "./disclaimers";
import {
  DEFAULT_WHITE_LABEL,
  type Organization,
  type ReportSection,
  type ReportSpec,
  type WhiteLabelConfig,
} from "./types";

export interface BuildReportSpecInput {
  generatedByUserId: string;
  organization?: Pick<Organization, "id" | "jurisdiction" | "whiteLabel"> | null;
  portfolioId: string;
  asOf?: ISODateString;
  sections?: ReadonlyArray<ReportSection>;
  title?: string;
  advisorNote?: string | null;
}

const DEFAULT_SECTIONS: ReadonlyArray<ReportSection> = [
  "summary",
  "allocation",
  "performance",
  "risk",
  "holdings",
  "appendix",
];

/**
 * Bouwt een `ReportSpec`. Disclaimers worden automatisch geselecteerd
 * o.b.v. organisatie-jurisdictie + secties die in het rapport zitten.
 *
 * **Bewuste keuze**: report-spec is data-only. Renderer komt v2 (PDF
 * via pdfmake of Puppeteer-route).
 */
export function buildReportSpec(input: BuildReportSpecInput): ReportSpec {
  const sections = input.sections ?? DEFAULT_SECTIONS;
  const jurisdiction = input.organization?.jurisdiction ?? null;
  const whiteLabel: WhiteLabelConfig =
    input.organization?.whiteLabel ?? DEFAULT_WHITE_LABEL;

  // Welke disclaimer-contexten zijn relevant voor deze sections?
  const contexts: Array<"general.investment_data" | "advisor.report" | "advisor.recommendation" | "white_label.footer"> = [
    "general.investment_data",
  ];
  if (input.organization) {
    contexts.push("advisor.report");
    if (input.organization.whiteLabel) contexts.push("white_label.footer");
    // Wanneer scenarios/holdings in scope zijn waar aanbevelingen mogelijk
    // zijn → ook recommendation-disclaimer.
    if (sections.includes("scenario") || sections.includes("appendix")) {
      contexts.push("advisor.recommendation");
    }
  }

  const disclaimers = selectDisclaimers({ contexts, jurisdiction });

  return {
    generatedByUserId: input.generatedByUserId,
    organizationId: input.organization?.id ?? null,
    portfolioId: input.portfolioId,
    asOf: input.asOf ?? new Date().toISOString(),
    sections,
    disclaimers,
    whiteLabel,
    title: input.title ?? "Portefeuille-rapportage",
    advisorNote: input.advisorNote ?? null,
  };
}
