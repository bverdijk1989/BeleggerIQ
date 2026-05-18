/**
 * Advisor Pilot Workspace — service-laag (Module 24).
 *
 * Server-side data-collection met privacy-boundary:
 *  - lijst van cliënten die expliciet aan deze advisor zijn gekoppeld
 *  - per cliënt: portfolio-count, position-count, last-activity
 *  - GEEN holdings / GEEN bedragen in de lijst — die komen pas op
 *    client-detail-page nadat boundary opnieuw is gecheckt
 *
 * **Faal-safe**: missing-user (link aanwezig maar e-mail bestaat niet in
 * `User`-tabel) → counted als `missingClientCount`, geen crash.
 */

import crypto from "node:crypto";

import { prisma } from "@/lib/data/prisma";
import { maskEmail } from "@/lib/admin/guards";
import type { BillingTier } from "@/types/profile";

import { checkClientAccess, parseWorkspaceLinks } from "./resolver";
import type {
  AccessDecision,
  AdvisorClientDetail,
  AdvisorClientSummary,
  AdvisorWorkspace,
  LoadWorkspaceResult,
} from "./types";
import { WORKSPACE_LINKS_ENV } from "./types";

/**
 * Deterministische client-ID — sha256 van email, eerste 12 hex-chars.
 * Wordt gebruikt in URL-paden (`/advisor/clients/[clientId]`) zodat
 * raw e-mails NIET in de browser-history of analytics belanden.
 *
 * **Niet-cryptografisch geheim** — dit is een display-id, niet een
 * autorisatie-token. De boundary-check leest altijd opnieuw uit
 * env-allowlist o.b.v. resolved e-mail.
 */
export function clientIdFromEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  return crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 12);
}

/**
 * Volledige email-hash voor audit-trail (full sha256). Niet voor URL.
 */
export function clientEmailHash(email: string): string {
  const normalized = email.trim().toLowerCase();
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

/**
 * Laad de workspace voor een ingelogde advisor. Geeft alle gekoppelde
 * cliënten terug met publieke metadata.
 */
export async function loadAdvisorWorkspace(input: {
  advisorEmail: string;
  envValue?: string;
}): Promise<LoadWorkspaceResult> {
  const envValue = input.envValue ?? process.env[WORKSPACE_LINKS_ENV];
  const links = parseWorkspaceLinks(envValue);
  const link = links.find(
    (l) => l.advisorEmail === input.advisorEmail.trim().toLowerCase(),
  );

  if (!link) {
    return {
      workspace: {
        advisorEmail: input.advisorEmail.toLowerCase(),
        clients: [],
        source: "none",
        missingClientCount: 0,
      },
    };
  }

  const users = await prisma.user
    .findMany({
      where: { email: { in: [...link.clientEmails] } },
      include: {
        profile: { select: { billingTier: true } },
        portfolios: {
          select: {
            id: true,
            holdings: { select: { id: true } },
          },
        },
      },
    })
    .catch(() => []);

  const lastActivity = await prisma.auditEntry
    .findMany({
      where: { userId: { in: users.map((u) => u.id) } },
      orderBy: { createdAt: "desc" },
      distinct: ["userId"],
      select: { userId: true, createdAt: true },
    })
    .catch(() => []);
  const lastActivityById = new Map(
    lastActivity.map((row) => [row.userId, row.createdAt]),
  );

  const summaries: AdvisorClientSummary[] = users.map((u) => {
    const positionCount = u.portfolios.reduce(
      (sum, p) => sum + p.holdings.length,
      0,
    );
    return {
      maskedEmail: maskEmail(u.email),
      clientId: clientIdFromEmail(u.email),
      tier: (u.profile?.billingTier ?? "FREE") as BillingTier,
      portfolioCount: u.portfolios.length,
      positionCount,
      lastActivityAt:
        lastActivityById.get(u.id)?.toISOString() ?? null,
      createdAt: u.createdAt.toISOString(),
    };
  });

  // Stable order — alfabetisch op gemaskeerde e-mail.
  summaries.sort((a, b) => a.maskedEmail.localeCompare(b.maskedEmail));

  const found = new Set(users.map((u) => u.email.toLowerCase()));
  const missing = link.clientEmails.filter((e) => !found.has(e)).length;

  return {
    workspace: {
      advisorEmail: link.advisorEmail,
      clients: summaries,
      source: "env_allowlist",
      missingClientCount: missing,
    },
  };
}

/**
 * Resolve een `clientId` (deterministische hash) terug naar de
 * cliënt-email — uitsluitend binnen de scope van deze advisor's
 * workspace. Voorkomt dat een advisor een willekeurige hash kan raden.
 */
export function resolveClientIdInWorkspace(input: {
  advisorEmail: string;
  clientId: string;
  envValue?: string;
}): { clientEmail: string | null } {
  const envValue = input.envValue ?? process.env[WORKSPACE_LINKS_ENV];
  const links = parseWorkspaceLinks(envValue);
  const link = links.find(
    (l) => l.advisorEmail === input.advisorEmail.trim().toLowerCase(),
  );
  if (!link) return { clientEmail: null };

  for (const clientEmail of link.clientEmails) {
    if (clientIdFromEmail(clientEmail) === input.clientId) {
      return { clientEmail };
    }
  }
  return { clientEmail: null };
}

/**
 * Laad detail-view voor één cliënt — incl. boundary-check.
 *
 * Returnt `null` wanneer:
 *  - clientId niet binnen advisor's workspace valt
 *  - cliënt-user bestaat niet (DB-state divergeert van env-allowlist)
 *  - boundary-check faalt om welke reden dan ook
 */
export async function loadAdvisorClientDetail(input: {
  advisorEmail: string;
  clientId: string;
  envValue?: string;
}): Promise<{
  detail: AdvisorClientDetail | null;
  decision: AccessDecision;
}> {
  const envValue = input.envValue ?? process.env[WORKSPACE_LINKS_ENV];
  const { clientEmail } = resolveClientIdInWorkspace({
    advisorEmail: input.advisorEmail,
    clientId: input.clientId,
    envValue,
  });
  if (!clientEmail) {
    return {
      detail: null,
      decision: { allowed: false, reason: "not_linked" },
    };
  }

  // Dubbele check — defense-in-depth (env-resolver én access-check
  // gaan via dezelfde bron, maar lees opnieuw zodat een toekomstige
  // DB-resolver beide paden onafhankelijk valideert).
  const decision = checkClientAccess(input.advisorEmail, clientEmail, envValue);
  if (!decision.allowed) {
    return { detail: null, decision };
  }

  const user = await prisma.user
    .findUnique({
      where: { email: clientEmail },
      include: {
        profile: { select: { billingTier: true } },
        portfolios: {
          select: {
            id: true,
            isPrimary: true,
            baseCurrency: true,
            cashBalance: true,
            holdings: { select: { id: true, currentPrice: true, quantity: true } },
          },
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        },
      },
    })
    .catch(() => null);
  if (!user) {
    return {
      detail: null,
      decision: { allowed: false, reason: "client_not_found" },
    };
  }

  const lastAudit = await prisma.auditEntry
    .findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    })
    .catch(() => null);

  const primary = user.portfolios.find((p) => p.isPrimary) ?? user.portfolios[0];
  const positionCount = user.portfolios.reduce(
    (sum, p) => sum + p.holdings.length,
    0,
  );

  // Indicatieve totale waarde — som over alle portefeuilles.
  // currentPrice * quantity + cashBalance. Per-portfolio currency wordt
  // hier niet geconverteerd (cliëntlijst is informatief); een rapport
  // gebruikt `buildPortfolioView` voor canonieke FX-conversie.
  let indicativeValue = 0;
  let hasValueData = false;
  for (const p of user.portfolios) {
    const cash = Number(p.cashBalance ?? 0);
    indicativeValue += cash;
    for (const h of p.holdings) {
      const price = h.currentPrice ? Number(h.currentPrice) : null;
      const qty = Number(h.quantity);
      if (price !== null && Number.isFinite(price)) {
        indicativeValue += price * qty;
        hasValueData = true;
      }
    }
  }

  const baseCurrency = primary?.baseCurrency ?? "EUR";

  const detail: AdvisorClientDetail = {
    maskedEmail: maskEmail(user.email),
    clientId: clientIdFromEmail(user.email),
    tier: (user.profile?.billingTier ?? "FREE") as BillingTier,
    portfolioCount: user.portfolios.length,
    positionCount,
    lastActivityAt: lastAudit?.createdAt.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    clientEmailHash: clientEmailHash(user.email),
    unsafeEmail: user.email,
    primaryPortfolioId: primary?.id ?? null,
    totalValue: hasValueData ? indicativeValue : null,
    baseCurrency,
  };
  return { detail, decision };
}

/** Helper: workspace-summary voor display in dashboard-header. */
export function workspaceHeaderStats(workspace: AdvisorWorkspace): {
  totalClients: number;
  totalPortfolios: number;
  totalPositions: number;
  missingLinks: number;
} {
  let totalPortfolios = 0;
  let totalPositions = 0;
  for (const c of workspace.clients) {
    totalPortfolios += c.portfolioCount;
    totalPositions += c.positionCount;
  }
  return {
    totalClients: workspace.clients.length,
    totalPortfolios,
    totalPositions,
    missingLinks: workspace.missingClientCount,
  };
}
