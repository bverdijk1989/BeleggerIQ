export * from "./types";
export {
  computeBox3,
  BOX3_RATES_2025,
  type Box3Rates,
  type ComputeBox3Input,
} from "./box3";
export {
  computeDividendTax,
  detectDomicile,
  WHT_RULES,
  type ComputeDividendTaxInput,
  type ComputeDividendTaxInputEntry,
} from "./dividend-tax";
export {
  computeNetReturn,
  buildTaxReport,
  type ComputeNetReturnInput,
} from "./net-return";
export { computeTwrYear, type ComputeTwrYearInput } from "./twr";
