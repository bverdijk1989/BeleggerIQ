import { beforeEach, describe, expect, it, vi } from "vitest";

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
    },
  },
}));

import { GET as callbackGET } from "@/app/auth/callback/route";
import { issueMagicLink } from "./magic-link";

const SECRET = "x".repeat(48);

beforeEach(() => {
  store.rows = [];
  nextId = 0;
  process.env.BIQ_SESSION_SECRET = SECRET;
});

function buildRequest(rawToken: string | null): Request {
  const url = rawToken
    ? `http://localhost:3000/auth/callback?token=${encodeURIComponent(rawToken)}`
    : `http://localhost:3000/auth/callback`;
  return new Request(url) as unknown as Request;
}

describe("/auth/callback route", () => {
  it("ontbrekend token → redirect naar /login?error=missing-token", async () => {
    const res = await callbackGET(
      buildRequest(null) as unknown as Parameters<typeof callbackGET>[0],
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toMatch(
      /\/login\?error=missing-token/,
    );
  });

  it("ongeldig token → redirect naar /login?error=invalid", async () => {
    const res = await callbackGET(
      buildRequest("a".repeat(40)) as unknown as Parameters<
        typeof callbackGET
      >[0],
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toMatch(/\/login\?error=invalid/);
  });

  it("verlopen token → redirect naar /login?error=expired", async () => {
    const oldNow = new Date("2026-04-27T12:00:00.000Z");
    const issued = await issueMagicLink({
      email: "u@e.nl",
      now: oldNow,
      ttlMs: 1_000,
    });
    // Verleg `expiresAt` direct — engine compares against `Date.now()`,
    // niet override-able via route GET.
    store.rows[0]!.expiresAt = new Date("2025-01-01T00:00:00.000Z");
    const res = await callbackGET(
      buildRequest(issued.rawToken) as unknown as Parameters<
        typeof callbackGET
      >[0],
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toMatch(/\/login\?error=expired/);
  });

  it("hergebruikt token → redirect naar /login?error=already_used", async () => {
    const issued = await issueMagicLink({ email: "u@e.nl" });
    // First exchange consumeert het token.
    await callbackGET(
      buildRequest(issued.rawToken) as unknown as Parameters<
        typeof callbackGET
      >[0],
    );
    // Tweede exchange faalt.
    const second = await callbackGET(
      buildRequest(issued.rawToken) as unknown as Parameters<
        typeof callbackGET
      >[0],
    );
    expect(second.status).toBe(303);
    expect(second.headers.get("location")).toMatch(
      /\/login\?error=already_used/,
    );
  });

  it("happy-path → redirect naar /dashboard + Set-Cookie biq_session", async () => {
    const issued = await issueMagicLink({ email: "user@example.com" });
    const res = await callbackGET(
      buildRequest(issued.rawToken) as unknown as Parameters<
        typeof callbackGET
      >[0],
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toMatch(/\/dashboard$/);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/biq_session=/);
    expect(setCookie.toLowerCase()).toContain("httponly");
    // Token is gemarkeerd als gebruikt.
    expect(store.rows[0]?.usedAt).toBeInstanceOf(Date);
  });

  it("ontbrekende session-secret → redirect met session-config-error", async () => {
    delete process.env.BIQ_SESSION_SECRET;
    const issued = await issueMagicLink({ email: "u@e.nl" });
    const res = await callbackGET(
      buildRequest(issued.rawToken) as unknown as Parameters<
        typeof callbackGET
      >[0],
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toMatch(
      /\/login\?error=session-config/,
    );
  });
});
