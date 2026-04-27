import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory Prisma mock for the magic-link table.
interface FakeRow {
  id: string;
  email: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  ipHash: string | null;
  createdAt: Date;
}

const store: { rows: FakeRow[] } = { rows: [] };
let nextId = 0;

vi.mock("@/lib/data/prisma", () => ({
  prisma: {
    magicLinkToken: {
      async create({ data }: { data: Omit<FakeRow, "id"> }) {
        const row: FakeRow = {
          id: `mlt-${++nextId}`,
          email: data.email,
          tokenHash: data.tokenHash,
          expiresAt: data.expiresAt,
          createdAt: data.createdAt,
          usedAt: data.usedAt ?? null,
          ipHash: data.ipHash ?? null,
        };
        store.rows.push(row);
        return row;
      },
      async findFirst({ where }: { where: { tokenHash: string } }) {
        return store.rows.find((r) => r.tokenHash === where.tokenHash) ?? null;
      },
      async update({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<FakeRow>;
      }) {
        const row = store.rows.find((r) => r.id === where.id);
        if (!row) throw new Error("not found");
        Object.assign(row, data);
        return row;
      },
      async deleteMany() {
        const before = store.rows.length;
        store.rows = [];
        return { count: before };
      },
    },
  },
}));

import {
  consumeMagicLink,
  generateRawToken,
  hashIp,
  hashToken,
  issueMagicLink,
  MAGIC_LINK_TTL_MS_DEFAULT,
} from "./magic-link";

beforeEach(() => {
  store.rows = [];
  nextId = 0;
});

describe("hashToken", () => {
  it("levert 64-char hex SHA-256", () => {
    const hash = hashToken("abc");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("verschillende tokens → verschillende hashes", () => {
    expect(hashToken("a")).not.toBe(hashToken("b"));
  });

  it("zelfde token → zelfde hash (deterministisch)", () => {
    expect(hashToken("xyz")).toBe(hashToken("xyz"));
  });
});

describe("hashIp", () => {
  it("retourneert null voor leeg/undefined", () => {
    expect(hashIp(null)).toBe(null);
    expect(hashIp(undefined)).toBe(null);
    expect(hashIp("")).toBe(null);
  });
  it("hashes IP deterministisch", () => {
    expect(hashIp("1.2.3.4")).toMatch(/^[a-f0-9]{64}$/);
    expect(hashIp("1.2.3.4")).toBe(hashIp("1.2.3.4"));
  });
});

describe("generateRawToken", () => {
  it("levert 256-bit base64url-string (~43 chars)", () => {
    const t = generateRawToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(t.length).toBeGreaterThanOrEqual(40);
  });
  it("twee tokens zijn niet gelijk", () => {
    expect(generateRawToken()).not.toBe(generateRawToken());
  });
});

describe("issueMagicLink", () => {
  it("normaliseert email naar lowercase + slaat hash op", async () => {
    const r = await issueMagicLink({ email: "  Foo@Bar.NL " });
    expect(r.rawToken).toBeTruthy();
    expect(store.rows[0]?.email).toBe("foo@bar.nl");
    expect(store.rows[0]?.tokenHash).toBe(hashToken(r.rawToken));
  });

  it("rejecteert invalid email", async () => {
    await expect(issueMagicLink({ email: "no-at-sign" })).rejects.toThrow();
  });

  it("default ttl = 15 min", async () => {
    const now = new Date("2026-04-27T12:00:00.000Z");
    const r = await issueMagicLink({ email: "a@b.nl", now });
    const expected = now.getTime() + MAGIC_LINK_TTL_MS_DEFAULT;
    expect(r.expiresAt.getTime()).toBe(expected);
  });

  it("ttl override werkt", async () => {
    const now = new Date("2026-04-27T12:00:00.000Z");
    const r = await issueMagicLink({
      email: "a@b.nl",
      now,
      ttlMs: 5 * 60 * 1000,
    });
    expect(r.expiresAt.getTime()).toBe(now.getTime() + 5 * 60 * 1000);
  });

  it("slaat ipHash op wanneer ip is meegegeven, anders null", async () => {
    await issueMagicLink({ email: "a@b.nl", ip: "10.0.0.1" });
    expect(store.rows[0]?.ipHash).toMatch(/^[a-f0-9]{64}$/);
    await issueMagicLink({ email: "c@d.nl" });
    expect(store.rows[1]?.ipHash).toBe(null);
  });
});

describe("consumeMagicLink", () => {
  it("happy-path: geldig token → ok + email + usedAt gezet", async () => {
    const issued = await issueMagicLink({ email: "user@example.com" });
    const result = await consumeMagicLink({ rawToken: issued.rawToken });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.email).toBe("user@example.com");
    }
    expect(store.rows[0]?.usedAt).toBeInstanceOf(Date);
  });

  it("INVALID: token bestaat niet", async () => {
    const result = await consumeMagicLink({ rawToken: "definitely-wrong" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("INVALID");
  });

  it("ALREADY_USED: zelfde token tweede keer faalt", async () => {
    const issued = await issueMagicLink({ email: "u@e.nl" });
    await consumeMagicLink({ rawToken: issued.rawToken });
    const second = await consumeMagicLink({ rawToken: issued.rawToken });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe("ALREADY_USED");
  });

  it("EXPIRED: token verlopen → reason EXPIRED", async () => {
    const old = new Date("2026-04-27T12:00:00.000Z");
    const issued = await issueMagicLink({
      email: "u@e.nl",
      now: old,
      ttlMs: 1_000,
    });
    const muchLater = new Date(old.getTime() + 60_000);
    const result = await consumeMagicLink({
      rawToken: issued.rawToken,
      now: muchLater,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("EXPIRED");
    // usedAt mag NIET zijn gezet bij expired pad.
    expect(store.rows[0]?.usedAt).toBe(null);
  });

  it("verzint geen email — alleen op exact-match hash", async () => {
    await issueMagicLink({ email: "real@example.com" });
    const tampered = await consumeMagicLink({ rawToken: "fake-token-xyz" });
    expect(tampered.ok).toBe(false);
  });
});
