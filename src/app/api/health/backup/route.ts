import { readFile } from "node:fs/promises";

import { NextResponse } from "next/server";

import { log } from "@/lib/log";
import {
  backupHealthToHttpStatus,
  evaluateBackupHealth,
  type BackupStatusFile,
} from "@/lib/ops/backup-health";

/**
 * GET /api/health/backup
 *
 * Leest het status-file dat door `deploy/backup.sh` wordt geschreven en
 * geeft een health-verdict terug. Bedoeld voor monitoring (UptimeRobot,
 * Healthchecks.io, custom alert-cron).
 *
 *   200  status: "ok"        — laatste backup ≤ 30u oud + success
 *   503  status: "stale"     — > 30u oud
 *   503  status: "failed"    — laatste run mislukt
 *   503  status: "unknown"   — status-file ontbreekt of unparseable
 *
 * Geen auth: het endpoint lekt alleen "wanneer is de laatste backup
 * gestart" — dat is een gevoelig detail maar geen secret. Als je strikter
 * wilt zijn: voeg een `?token=` check toe in een latere iteratie.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_STATUS_FILE = "/var/www/beleggeriq/shared/backup-status.json";

async function readStatusFile(path: string): Promise<BackupStatusFile | null> {
  try {
    const raw = await readFile(path, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed as BackupStatusFile;
    }
    return null;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code: string }).code === "ENOENT"
    ) {
      return null;
    }
    log.warn("api:health:backup", "kon status-file niet lezen", { error });
    return null;
  }
}

export async function GET(): Promise<NextResponse> {
  const path = process.env.BACKUP_STATUS_FILE ?? DEFAULT_STATUS_FILE;
  const status = await readStatusFile(path);
  const verdict = evaluateBackupHealth({ status });
  return NextResponse.json(verdict, { status: backupHealthToHttpStatus(verdict) });
}
