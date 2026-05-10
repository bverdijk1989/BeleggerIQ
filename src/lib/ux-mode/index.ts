/**
 * Public API voor de UX-mode-laag.
 */

export {
  DEFAULT_UX_MODE,
  UX_MODE_DESCRIPTIONS,
  UX_MODE_LABELS,
  UX_MODE_TAGLINES,
  getDashboardVisibility,
  getVisibleNavRoutes,
  isRouteVisibleInMode,
  type DashboardVisibility,
  type NavRouteKey,
  type UxMode,
} from "./types";
export { getMicrocopy, type MicrocopySection } from "./microcopy";
