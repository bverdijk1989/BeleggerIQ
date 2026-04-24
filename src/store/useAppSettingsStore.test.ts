import { beforeEach, describe, expect, it, vi } from "vitest";

// Stub een simpele localStorage voordat de persist-middleware laadt —
// vitest draait in het `node` environment en heeft die niet.
function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: (index) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  } satisfies Storage;
}

vi.stubGlobal("localStorage", createMemoryStorage());

// Importeer ná stub zodat persist direct de mock pakt.
const { DEFAULT_BENCHMARK_TICKER, useAppSettingsStore } = await import(
  "./useAppSettingsStore"
);

beforeEach(() => {
  useAppSettingsStore.getState().reset();
});

describe("useAppSettingsStore", () => {
  it("initialiseert met premium dark defaults en EUR benchmark", () => {
    const state = useAppSettingsStore.getState();
    expect(state.theme).toBe("dark");
    expect(state.baseCurrency).toBe("EUR");
    expect(state.selectedBenchmarkTicker).toBe(DEFAULT_BENCHMARK_TICKER);
    expect(state.defensivenessLevel).toBe("balanced");
  });

  it("toggleSidebar flipt de staat", () => {
    useAppSettingsStore.getState().toggleSidebar();
    expect(useAppSettingsStore.getState().sidebarCollapsed).toBe(true);
    useAppSettingsStore.getState().toggleSidebar();
    expect(useAppSettingsStore.getState().sidebarCollapsed).toBe(false);
  });

  it("patchScreenerFilters merget incrementeel", () => {
    useAppSettingsStore
      .getState()
      .patchScreenerFilters({ minDividendYield: 0.03 });
    useAppSettingsStore
      .getState()
      .patchScreenerFilters({ sectors: ["Technology"] });

    const filters = useAppSettingsStore.getState().screenerFilters;
    expect(filters.minDividendYield).toBe(0.03);
    expect(filters.sectors).toEqual(["Technology"]);
  });

  it("clearScreenerFilters reset enkel de filters", () => {
    useAppSettingsStore.getState().setBaseCurrency("USD");
    useAppSettingsStore
      .getState()
      .patchScreenerFilters({ minDividendYield: 0.02 });
    useAppSettingsStore.getState().clearScreenerFilters();

    expect(useAppSettingsStore.getState().screenerFilters).toEqual({});
    expect(useAppSettingsStore.getState().baseCurrency).toBe("USD");
  });

  it("setActiveStrategyPresetSlug onthoudt keuze + accepteert null", () => {
    useAppSettingsStore
      .getState()
      .setActiveStrategyPresetSlug("quality-compounders");
    expect(
      useAppSettingsStore.getState().activeStrategyPresetSlug,
    ).toBe("quality-compounders");
    useAppSettingsStore.getState().setActiveStrategyPresetSlug(null);
    expect(useAppSettingsStore.getState().activeStrategyPresetSlug).toBeNull();
  });
});
