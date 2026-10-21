import Dexie, { type EntityTable } from 'dexie';
import type { AppSettings, Movement, SavingsMovement, Workday } from '../types';

interface MetadataRecord {
  key: string;
  value: AppSettings | boolean;
}

class LedgerDatabase extends Dexie {
  movements!: EntityTable<Movement, 'id'>;
  workdays!: EntityTable<Workday, 'id'>;
  savings!: EntityTable<SavingsMovement, 'id'>;
  metadata!: EntityTable<MetadataRecord, 'key'>;

  constructor() {
    super('CuentasRuta');
    this.version(1).stores({
      movements: '&id,space,kind,occurredAt,workdayId,[space+occurredAt]',
      workdays: '&id,startedAt,endedAt',
      savings: '&id,kind,occurredAt',
      metadata: '&key',
    });
  }
}

export const ledgerDatabase = new LedgerDatabase();
