import { db, type FinanceAssistantDatabase } from '../database/db';
import type { AppData } from '../types';

export const BACKUP_RETENTION_DAYS = 3;
export const BACKUP_RETENTION_MS = BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000;

function backupId(date: Date): string {
  const suffix = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `automatic-${date.toISOString()}-${suffix}`;
}

export async function createAutomaticBackup(data: AppData, now = new Date(), database: FinanceAssistantDatabase = db): Promise<void> {
  const createdAt = now.toISOString();
  const expiresBefore = new Date(now.getTime() - BACKUP_RETENTION_MS).toISOString();
  await database.transaction('rw', database.backups, async () => {
    const expired = await database.backups.where('createdAt').below(expiresBefore).primaryKeys();
    if (expired.length) await database.backups.bulkDelete(expired);
    await database.backups.put({
      id: backupId(now),
      createdAt,
      data: structuredClone(data),
    });
  });
}

export async function cleanupAutomaticBackups(now = new Date(), database: FinanceAssistantDatabase = db): Promise<number> {
  const expiresBefore = new Date(now.getTime() - BACKUP_RETENTION_MS).toISOString();
  return database.transaction('rw', database.backups, async () => {
    const expired = await database.backups.where('createdAt').below(expiresBefore).primaryKeys();
    if (expired.length) await database.backups.bulkDelete(expired);
    return expired.length;
  });
}

export async function listAutomaticBackups(now = new Date(), database: FinanceAssistantDatabase = db) {
  await cleanupAutomaticBackups(now, database);
  return database.backups.orderBy('createdAt').reverse().toArray();
}
