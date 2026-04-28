/**
 * Backup-health evaluator.
 *
 * Pure function: gegeven een backup-status (zoals geschreven door
 * `deploy/backup.sh` via `biq_write_status`) + nu-tijd → return een
 * health-verdict. Geen fs, geen network — testbaar zonder mocks.
 *
 * De drempel van 30 uur is bewust gekozen:
 *   - Daily timer draait 03:15 UTC + RandomizedDelaySec=15min, dus
 *     opeenvolgende runs liggen ~24u uit elkaar.
 *   - 30u = 24u cadence + 6u marge voor een gemiste run / langzame upload.
 *   - Boven 30u is er pas écht reden tot zorg → status: "stale".
 *
 * Drie uitkomsten:
 *   - "ok"      laatste run is succesvol en ≤ 30u oud
 *   - "stale"   laatste run is ouder dan 30u (ook als 'm succesvol was)
 *   - "failed"  laatste run is mislukt — altijd alarm, ongeacht leeftijd
 */

export interface BackupStatusFile {
  lastAttemptAt?: string;       // ISO-8601
  lastResult?: "success" | "failure";
  lastSuccessKey?: string;
  message?: string;
}

export type BackupHealthStatus = "ok" | "stale" | "failed" | "unknown";

export interface BackupHealthVerdict {
  status: BackupHealthStatus;
  lastAttemptAt: string | null;
  lastResult: "success" | "failure" | null;
  lastSuccessKey: string | null;
  ageHours: number | null;
  thresholdHours: number;
  message: string;
}

export interface EvaluateBackupHealthInput {
  status: BackupStatusFile | null;
  now?: Date;
  thresholdHours?: number;
}

const DEFAULT_THRESHOLD_HOURS = 30;

export function evaluateBackupHealth(
  input: EvaluateBackupHealthInput,
): BackupHealthVerdict {
  const now = input.now ?? new Date();
  const thresholdHours = input.thresholdHours ?? DEFAULT_THRESHOLD_HOURS;

  if (!input.status) {
    return {
      status: "unknown",
      lastAttemptAt: null,
      lastResult: null,
      lastSuccessKey: null,
      ageHours: null,
      thresholdHours,
      message: "Geen backup-status-file gevonden.",
    };
  }

  const { lastAttemptAt, lastResult, lastSuccessKey, message } = input.status;
  const parsed = lastAttemptAt ? new Date(lastAttemptAt) : null;
  const ageHours =
    parsed && !Number.isNaN(parsed.getTime())
      ? (now.getTime() - parsed.getTime()) / (1000 * 60 * 60)
      : null;

  if (lastResult === "failure") {
    return {
      status: "failed",
      lastAttemptAt: lastAttemptAt ?? null,
      lastResult: "failure",
      lastSuccessKey: lastSuccessKey ?? null,
      ageHours,
      thresholdHours,
      message: message ?? "Laatste backup is gefaald.",
    };
  }

  if (ageHours === null) {
    return {
      status: "unknown",
      lastAttemptAt: lastAttemptAt ?? null,
      lastResult: lastResult ?? null,
      lastSuccessKey: lastSuccessKey ?? null,
      ageHours: null,
      thresholdHours,
      message: "Status-file heeft geen geldige `lastAttemptAt`.",
    };
  }

  if (ageHours > thresholdHours) {
    return {
      status: "stale",
      lastAttemptAt: lastAttemptAt ?? null,
      lastResult: lastResult ?? null,
      lastSuccessKey: lastSuccessKey ?? null,
      ageHours,
      thresholdHours,
      message: `Laatste backup is ${ageHours.toFixed(1)}u oud (drempel: ${thresholdHours}u).`,
    };
  }

  return {
    status: "ok",
    lastAttemptAt: lastAttemptAt ?? null,
    lastResult: lastResult ?? "success",
    lastSuccessKey: lastSuccessKey ?? null,
    ageHours,
    thresholdHours,
    message: `Backup ${ageHours.toFixed(1)}u oud — binnen drempel.`,
  };
}

export function backupHealthToHttpStatus(verdict: BackupHealthVerdict): number {
  return verdict.status === "ok" ? 200 : 503;
}
