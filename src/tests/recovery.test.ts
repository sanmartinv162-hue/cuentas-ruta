import { afterEach, describe, expect, it } from 'vitest';
import { v4 as uuid } from 'uuid';
import { FinanceAssistantDatabase } from '../database/db';
import { createAutomaticBackup, listAutomaticBackups } from '../services/backup.service';
import { createEmptyData } from '../models/defaults';

describe('respaldo automático', () => {
  let database: FinanceAssistantDatabase | undefined;

  afterEach(async () => {
    database?.close();
    if (database) await database.delete();
  });

  it('conserva tres días y elimina copias anteriores', async () => {
    database = new FinanceAssistantDatabase(`RecoveryTests-${uuid()}`);
    await database.open();
    const data = createEmptyData();
    const dayFour = new Date('2026-10-24T12:00:00.000Z');

    await createAutomaticBackup(data, new Date('2026-10-20T12:00:00.000Z'), database);
    await createAutomaticBackup(data, new Date('2026-10-21T12:00:00.000Z'), database);
    await createAutomaticBackup(data, new Date('2026-10-22T12:00:00.000Z'), database);
    await createAutomaticBackup(data, dayFour, database);

    const backups = await listAutomaticBackups(dayFour, database);
    expect(backups.map((backup) => backup.createdAt)).toEqual([
      '2026-10-24T12:00:00.000Z',
      '2026-10-22T12:00:00.000Z',
      '2026-10-21T12:00:00.000Z',
    ]);
  });
});
