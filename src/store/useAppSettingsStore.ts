"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { Currency } from "@/types/common";
import type {
  DefensivenessLevel,
  ScreenerFilters,
} from "@/types/screener";

/**
 * App settings store.
 *
 * State boundaries:
 *  - Dit is de enige store die persisted wordt. Inhoud is bewust narrow:
 *    UI-voorkeuren en user-gekozen defaults die de app tussen sessies
 *    terug moet tonen. Geen server-data, geen portfolio-metriek.
 *  - Zustand `persist` schrijft naar localStorage onder
 *    `beleggeriq:app-settings`. Bij een breaking change bump je `version`
 *    en vul je `migrate` (deze wordt automatisch aangeroepen).
 */

export type ThemeMode = "dark" | "light" | "system";
export type DisplayDensity = "comfortable" | "compact";

export const DEFAULT_BENCHMARK_TICKER = "IWDA";

interface AppSettingsValues {
  // UI
  theme: ThemeMode;
  density: DisplayDensity;
  sidebarCollapsed: boolean;

  // Core defaults
  baseCurrency: Currency;
  selectedBenchmarkTicker: string;

  // Beleggingsstand
  defensivenessLevel: DefensivenessLevel;
  activeStrategyPresetSlug: string | null;

  // Screener
  screenerFilters: ScreenerFilters;
}

interface AppSettingsActions {
  setTheme: (theme: ThemeMode) => void;
  setDensity: (density: DisplayDensity) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;

  setBaseCurrency: (currency: Currency) => void;
  setSelectedBenchmarkTicker: (ticker: string) => void;

  setDefensivenessLevel: (level: DefensivenessLevel) => void;
  setActiveStrategyPresetSlug: (slug: string | null) => void;

  setScreenerFilters: (filters: ScreenerFilters) => void;
  patchScreenerFilters: (patch: Partial<ScreenerFilters>) => void;
  clearScreenerFilters: () => void;

  reset: () => void;
}

export type AppSettingsStore = AppSettingsValues & AppSettingsActions;

const INITIAL: AppSettingsValues = {
  theme: "dark",
  density: "comfortable",
  sidebarCollapsed: false,

  baseCurrency: "EUR",
  selectedBenchmarkTicker: DEFAULT_BENCHMARK_TICKER,

  defensivenessLevel: "balanced",
  activeStrategyPresetSlug: null,

  screenerFilters: {},
};

export const useAppSettingsStore = create<AppSettingsStore>()(
  persist(
    (set) => ({
      ...INITIAL,

      setTheme: (theme) => set({ theme }),
      setDensity: (density) => set({ density }),
      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),

      setBaseCurrency: (baseCurrency) => set({ baseCurrency }),
      setSelectedBenchmarkTicker: (selectedBenchmarkTicker) =>
        set({ selectedBenchmarkTicker }),

      setDefensivenessLevel: (defensivenessLevel) =>
        set({ defensivenessLevel }),
      setActiveStrategyPresetSlug: (activeStrategyPresetSlug) =>
        set({ activeStrategyPresetSlug }),

      setScreenerFilters: (screenerFilters) => set({ screenerFilters }),
      patchScreenerFilters: (patch) =>
        set((state) => ({
          screenerFilters: { ...state.screenerFilters, ...patch },
        })),
      clearScreenerFilters: () => set({ screenerFilters: {} }),

      reset: () => set(INITIAL),
    }),
    {
      name: "beleggeriq:app-settings",
      version: 2,
      // Alleen persistente waarden uitschrijven; expliciet zodat
      // toekomstige niet-persistente velden niet per ongeluk mee lekken.
      partialize: (state) => ({
        theme: state.theme,
        density: state.density,
        sidebarCollapsed: state.sidebarCollapsed,
        baseCurrency: state.baseCurrency,
        selectedBenchmarkTicker: state.selectedBenchmarkTicker,
        defensivenessLevel: state.defensivenessLevel,
        activeStrategyPresetSlug: state.activeStrategyPresetSlug,
        screenerFilters: state.screenerFilters,
      }),
      migrate: (persistedState, version) => {
        // v1 → v2: `displayCurrency` is hernoemd naar `baseCurrency`.
        if (!persistedState || typeof persistedState !== "object") {
          return persistedState as AppSettingsValues;
        }
        const legacy = persistedState as Partial<AppSettingsValues> & {
          displayCurrency?: Currency;
        };
        if (version < 2 && legacy.displayCurrency && !legacy.baseCurrency) {
          legacy.baseCurrency = legacy.displayCurrency;
        }
        return legacy as AppSettingsValues;
      },
    },
  ),
);
