/**
 * Role-permission matrix — fijnmazige permissie-checks zonder volle
 * RBAC-engine.
 *
 * **Filosofie**: één centrale tabel `ROLE_PERMISSIONS`. Alle
 * autorisatie-beslissingen lezen hieruit; geen if-else per route.
 * Wanneer we later naar een DB-gedreven RBAC migreren, is dit de
 * default-set die we daarheen kopiëren.
 */

import { ORG_ROLE_ORDER, type OrgPermission, type OrgRole } from "./types";

/**
 * Wie mag wat? Lees: voor elke role een set van toegestane permissions.
 *
 * **Bewuste keuze**: rollen stapelen NIET automatisch (OWNER includes
 * ADMIN-permissies omdat we ze EXPLICIET toevoegen, niet via
 * inheritance). Reden: maakt downgrade-paden voorspelbaar.
 */
export const ROLE_PERMISSIONS: Record<OrgRole, ReadonlyArray<OrgPermission>> = {
  OWNER: [
    "org.manage",
    "org.billing",
    "org.white_label",
    "client.list",
    "client.read",
    "client.write",
    "report.generate",
    "report.read",
    "audit.read",
  ],
  ADMIN: [
    "org.manage",
    "org.white_label",
    "client.list",
    "client.read",
    "client.write",
    "report.generate",
    "report.read",
    "audit.read",
  ],
  ADVISOR: [
    "client.list",
    "client.read",
    "client.write",
    "report.generate",
    "report.read",
  ],
  VIEWER: ["client.list", "client.read", "report.read"],
  CLIENT: ["client.read", "report.read"], // Alleen op eigen data — extra check buiten role.
};

/**
 * Mag deze rol een specifieke permissie uitvoeren?
 */
export function hasPermission(
  role: OrgRole,
  permission: OrgPermission,
): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/**
 * Welke rollen mogen deze permissie? Handig voor UI-hints
 * ("upgrade naar ADMIN om dit te doen").
 */
export function rolesWithPermission(
  permission: OrgPermission,
): ReadonlyArray<OrgRole> {
  return ORG_ROLE_ORDER.filter((r) => hasPermission(r, permission));
}

/**
 * Rangorde — lager = meer privileges. Voor compare-checks
 * (bv. "een ADMIN mag een ADVISOR demoten maar niet andersom").
 */
const ROLE_RANK: Record<OrgRole, number> = {
  OWNER: 0,
  ADMIN: 1,
  ADVISOR: 2,
  VIEWER: 3,
  CLIENT: 4,
};

/**
 * Mag actor (rol A) een target (rol B) wijzigen? Regel: actor moet
 * strikt hoger in rangorde zijn (lager rank-getal). OWNER kan
 * iedereen behalve zichzelf demoten; CLIENT kan niemand wijzigen.
 *
 * **Edge-case**: OWNER kan een andere OWNER niet demoten — dat is een
 * apart "ownership-transfer"-flow voor v2.
 */
export function canManageRole(actor: OrgRole, target: OrgRole): boolean {
  // Alleen OWNER + ADMIN doen role-management — ADVISOR/VIEWER/CLIENT
  // hebben geen autoriteit om iemands rol te wijzigen.
  if (actor !== "OWNER" && actor !== "ADMIN") return false;
  if (actor === "OWNER" && target === "OWNER") return false;
  return ROLE_RANK[actor] < ROLE_RANK[target];
}

/**
 * Convenience checks die in UI/server-actions teruggebruikt worden.
 */
export const can = {
  manageClients: (role: OrgRole) => hasPermission(role, "client.write"),
  generateReports: (role: OrgRole) => hasPermission(role, "report.generate"),
  manageOrg: (role: OrgRole) => hasPermission(role, "org.manage"),
  configureWhiteLabel: (role: OrgRole) =>
    hasPermission(role, "org.white_label"),
  readAuditLog: (role: OrgRole) => hasPermission(role, "audit.read"),
};
