/**
 * Email Drip & Monthly Investor Review — public API (Module 34).
 */

export {
  buildMonthlyReview,
  type BuildMonthlyReviewInput,
} from "./generator";
export {
  loadMonthlyReview,
  type LoadMonthlyReviewInput,
  type LoadMonthlyReviewResult,
} from "./loader";
export { renderReviewEmail } from "./template";
export {
  buildUnsubscribeUrl,
  createUnsubscribeToken,
  verifyUnsubscribeToken,
} from "./unsubscribe";
export {
  MONTHLY_REVIEW_DISCLAIMER,
  SECTION_LABELS,
  SECTION_ORDER,
  type MonthlyReviewData,
  type RenderedReviewEmail,
  type ReviewSection,
} from "./types";
