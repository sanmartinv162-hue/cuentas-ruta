import { db, type FinanceAssistantDatabase } from '../database/db';
import { financialAccountSchema } from '../models/financialAccount';
import { normalizeFinancialAccountName } from '../models/financialAccount';
import type { FinancialAccountRecord, FinancialModule } from '../types/database';
import { BaseRepository } from './base.repository';

export class FinancialAccountRepository extends BaseRepository<FinancialAccountRecord> {
  constructor(private readonly database: FinanceAssistantDatabase = db) {
    super(database.accounts, financialAccountSchema, {
      dateField: 'createdAt',
      descriptionField: 'name',
      searchableFields: ['name', 'module', 'id'],
    });
  }

  ensureExists(module: FinancialModule, normalizedName: string, timestamp: string, createRecord: () => FinancialAccountRecord): Promise<FinancialAccountRecord> {
    return this.database.transaction('rw', [this.database.accounts], async () => {
      const existing = await this.database.accounts.where('[module+normalizedName]').equals([module, normalizedName]).first();
      if (existing) {
        if (!existing.deletedAt) return existing;
        const restored = { ...existing, deletedAt: null, updatedAt: timestamp };
        await this.database.accounts.put(restored);
        return restored;
      }
      const record = createRecord();
      await this.database.accounts.add(record);
      return record;
    });
  }

  async findByModule(module: FinancialModule, includeDeleted = false): Promise<FinancialAccountRecord[]> {
    return (await this.findAll({ includeDeleted })).filter((account) => account.module === module);
  }

  async findByName(module: FinancialModule, name: string, includeDeleted = false): Promise<FinancialAccountRecord | null> {
    const normalized = normalizeFinancialAccountName(name);
    const account = await this.table.where('[module+normalizedName]').equals([module, normalized]).first();
    return account && (includeDeleted || !account.deletedAt) ? account : null;
  }
}

export const financialAccountRepository = new FinancialAccountRepository();
