/**
 * Single-source-of-truth helper voor per-holding positie-cap.
 *
 * Gebruikt door de rebalance-engine, action-classifier en holding-action
 * classifier. Lost het oude probleem op waarbij elk van die engines
 * onafhankelijk een platte `policy.maxPositionWeight` (10%) toepaste op
 * álle holdings — inclusief broad-market ETFs die volgens Bogle/Buffett
 * als 60–90% van de portfolio mogen tellen.
 *
 * Dunne wrapper rond `resolvePositionLimitByAssetType`. Bestaat zodat
 * caller-code niet hoeft te weten van `InstrumentRiskAssessment` als die
 * niet beschikbaar is — dan vallen we terug op een neutrale low-risk
 * assessment zodat de cap puur door instrument-type wordt bepaald.
 */

import type {
  InstrumentClassification,
} from "@/lib/analytics/instruments";

import {
  resolvePositionLimitByAssetType,
} from "./position-limits";
import type { PolicyContext, PositionLimit } from "./types";

export interface CapForHoldingInput {
  classification: InstrumentClassification | null | undefined;
  policy?: PolicyContext;
}

const NEUTRAL_RISK = {
  level: "MODERATE" as const,
  rationale: [],
};

export function capForHolding(input: CapForHoldingInput): PositionLimit | null {
  if (!input.classification) return null;
  return resolvePositionLimitByAssetType({
    classification: input.classification,
    risk: NEUTRAL_RISK,
    context: input.policy,
  });
}
