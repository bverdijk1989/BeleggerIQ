/**
 * Community Intelligence — public API.
 *
 * **Privacy-grens**: alleen `loadCommunityBenchmark` is bedoeld als
 * data-toegang vanaf UI/server-actions. Alle andere helpers zijn
 * pure-functioneel zodat ze in tests gebruikt kunnen worden zonder
 * DB-koppeling.
 */

export * from "./types";
export * from "./consent";
export * from "./cohort";
export * from "./anonymizer";
export * from "./baselines";
export * from "./benchmark";
export { loadCommunityBenchmark } from "./loader";
export type {
  LoadCommunityBenchmarkInput,
  LoadCommunityBenchmarkResult,
} from "./loader";
