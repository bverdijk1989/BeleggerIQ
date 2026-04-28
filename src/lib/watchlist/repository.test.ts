import { beforeEach, describe, expect, it, vi } from "vitest";

interface FakeWatchRow {
  id: string;
  userId: string;
  ticker: string;
  name: string | null;
  note: string | null;
  targetPrice: number | null;
  targetPriceHigh: number | null;
  buyZoneTolerance: number | null;
  valuationMaxPE: number | null;
  valuationMinFcfYield: number | null;
  addedAt: Date;
  updatedAt: Date;
}

interface FakeUser {
  id: string;
  email: string;
}

const store = {
  users: [] as FakeUser[],
  rows: [] as FakeWatchRow[],
};

let nextId = 1;

vi.mock("@/lib/data", () => ({
  prisma: {
    user: {
      findUnique: async ({ where }: { where: { email: string } }) =>
        store.users.find((u) => u.email === where.email) ?? null,
    },
    watchlistItem: {
      findUnique: async ({
        where,
      }: {
        where: { userId_ticker: { userId: string; ticker: string } };
      }) =>
        store.rows.find(
          (r) =>
            r.userId === where.userId_ticker.userId &&
            r.ticker === where.userId_ticker.ticker,
        ) ?? null,
      create: async ({ data }: { data: Omit<FakeWatchRow, "id" | "addedAt" | "updatedAt"> }) => {
        const now = new Date();
        const row: FakeWatchRow = {
          id: `wl-${nextId++}`,
          userId: data.userId,
          ticker: data.ticker,
          name: data.name ?? null,
          note: data.note ?? null,
          targetPrice: null,
          targetPriceHigh: null,
          buyZoneTolerance: null,
          valuationMaxPE: null,
          valuationMinFcfYield: null,
          addedAt: now,
          updatedAt: now,
        };
        store.rows.push(row);
        return row;
      },
      update: async ({
        where,
        data,
      }: {
        where: { userId_ticker: { userId: string; ticker: string } };
        data: Partial<FakeWatchRow> & { targetPrice?: { toString(): string } | null; targetPriceHigh?: { toString(): string } | null };
      }) => {
        const row = store.rows.find(
          (r) =>
            r.userId === where.userId_ticker.userId &&
            r.ticker === where.userId_ticker.ticker,
        );
        if (!row) throw new Error("not found");
        if ("targetPrice" in data)
          row.targetPrice =
            data.targetPrice === null || data.targetPrice === undefined
              ? null
              : Number(data.targetPrice.toString());
        if ("targetPriceHigh" in data)
          row.targetPriceHigh =
            data.targetPriceHigh === null || data.targetPriceHigh === undefined
              ? null
              : Number(data.targetPriceHigh.toString());
        if ("buyZoneTolerance" in data)
          row.buyZoneTolerance = data.buyZoneTolerance ?? null;
        row.updatedAt = new Date();
        return row;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { userId: string; ticker: string };
        data: Partial<FakeWatchRow>;
      }) => {
        const matches = store.rows.filter(
          (r) => r.userId === where.userId && r.ticker === where.ticker,
        );
        for (const row of matches) {
          const target = row as unknown as Record<string, unknown>;
          const source = data as unknown as Record<string, unknown>;
          for (const k of Object.keys(source)) {
            target[k] = source[k];
          }
        }
        return { count: matches.length };
      },
      deleteMany: async ({
        where,
      }: {
        where: { userId: string; ticker?: string; id?: string };
      }) => {
        const before = store.rows.length;
        store.rows = store.rows.filter((r) => {
          if (r.userId !== where.userId) return true;
          if (where.ticker && r.ticker !== where.ticker) return true;
          if (where.id && r.id !== where.id) return true;
          return false;
        });
        return { count: before - store.rows.length };
      },
    },
  },
}));

import { watchlistRepository } from "./repository";

beforeEach(() => {
  store.users = [
    { id: "u-alice", email: "alice@example.com" },
    { id: "u-bob", email: "bob@example.com" },
  ];
  store.rows = [];
  nextId = 1;
});

describe("watchlistRepository.add", () => {
  it("voegt nieuwe (userId, ticker) toe", async () => {
    const r = await watchlistRepository.add({
      email: "alice@example.com",
      ticker: "AAPL",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.created).toBe(true);
      expect(r.item.ticker).toBe("AAPL");
      expect(r.item.userId).toBe("u-alice");
    }
  });

  it("duplicate-prevention: tweede add → created=false, geen extra rij", async () => {
    await watchlistRepository.add({ email: "alice@example.com", ticker: "AAPL" });
    const r = await watchlistRepository.add({
      email: "alice@example.com",
      ticker: "AAPL",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.created).toBe(false);
    expect(store.rows.length).toBe(1);
  });

  it("twee verschillende users mogen dezelfde ticker bewaren", async () => {
    await watchlistRepository.add({ email: "alice@example.com", ticker: "AAPL" });
    await watchlistRepository.add({ email: "bob@example.com", ticker: "AAPL" });
    expect(store.rows.length).toBe(2);
  });

  it("onbekende user → user_not_found", async () => {
    const r = await watchlistRepository.add({
      email: "ghost@example.com",
      ticker: "AAPL",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("user_not_found");
  });
});

describe("watchlistRepository.removeByTicker", () => {
  it("verwijdert eigen rij", async () => {
    await watchlistRepository.add({ email: "alice@example.com", ticker: "AAPL" });
    const ok = await watchlistRepository.removeByTicker("alice@example.com", "AAPL");
    expect(ok).toBe(true);
    expect(store.rows.length).toBe(0);
  });

  it("user kan rij van andere user NIET verwijderen", async () => {
    await watchlistRepository.add({ email: "alice@example.com", ticker: "AAPL" });
    const removed = await watchlistRepository.removeByTicker("bob@example.com", "AAPL");
    expect(removed).toBe(false);
    expect(store.rows.length).toBe(1);
  });

  it("not-found → false (zonder crash)", async () => {
    const ok = await watchlistRepository.removeByTicker(
      "alice@example.com",
      "GHOST",
    );
    expect(ok).toBe(false);
  });
});

describe("watchlistRepository.removeById", () => {
  it("user kan rij-id van andere user NIET verwijderen", async () => {
    const r = await watchlistRepository.add({
      email: "alice@example.com",
      ticker: "AAPL",
    });
    if (!r.ok) throw new Error("setup failed");
    const aliceRowId = r.item.id;
    // Bob probeert het id te raden:
    const removed = await watchlistRepository.removeById(
      "bob@example.com",
      aliceRowId,
    );
    expect(removed).toBe(false);
    expect(store.rows.length).toBe(1); // niet aangetast
  });
});

describe("watchlistRepository.setAlert", () => {
  it("schrijft targetPrice + targetPriceHigh", async () => {
    await watchlistRepository.add({ email: "alice@example.com", ticker: "AAPL" });
    const updated = await watchlistRepository.setAlert({
      email: "alice@example.com",
      ticker: "AAPL",
      targetPrice: 150,
      targetPriceHigh: 160,
      buyZoneTolerance: 0.05,
    });
    expect(updated?.targetPrice).toBe(150);
    expect(updated?.targetPriceHigh).toBe(160);
    expect(updated?.buyZoneTolerance).toBe(0.05);
  });

  it("clearAlert zet alle thresholds op null maar bewaart de rij", async () => {
    await watchlistRepository.add({ email: "alice@example.com", ticker: "AAPL" });
    await watchlistRepository.setAlert({
      email: "alice@example.com",
      ticker: "AAPL",
      targetPrice: 150,
    });
    const ok = await watchlistRepository.clearAlert("alice@example.com", "AAPL");
    expect(ok).toBe(true);
    expect(store.rows.length).toBe(1);
    expect(store.rows[0]!.targetPrice).toBeNull();
  });
});
