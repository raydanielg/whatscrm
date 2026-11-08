/**
 * Backup engine availability.
 *
 * Backup Management stores jobs, schedules and restore operations, but nothing in
 * this codebase ever produces a backup file: there is no worker, no exporter and
 * no scheduler for `backup_jobs`. The old handlers pretended otherwise —
 * `createBackup` left a permanent "queued" row, `verifyBackup` wrote
 * `checksum_ok / manifest_ok / restorable = true` without reading anything, and
 * `executeRestore` set "restoring" and stopped. A customer could believe they had
 * a verified, restorable backup when no backup existed.
 *
 * Until a real engine is connected, every action that promises to DO something
 * refuses with this message. Reading, cancelling and deleting existing rows still
 * work. When an engine is built, flip `available` (or derive it from real
 * capability) and remove the guards.
 */
export const BACKUP_ENGINE = {
  available: false as boolean,
  reason:
    "no backup worker is connected on this deployment, so the app cannot create, verify or restore backups. " +
    "Rely on your database host's backups (for example Supabase daily backups and point-in-time recovery).",
};

export function requireBackupEngine(action: string): void {
  if (!BACKUP_ENGINE.available) {
    throw new Error(`${action} isn't available: ${BACKUP_ENGINE.reason}`);
  }
}
