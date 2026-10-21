import { db, type FinanceAssistantDatabase } from '../database/db';
import { accountTransferSchema } from '../models/accountTransfer';
import type { AccountTransferRecord, FinancialModule } from '../types/database';
import { BaseRepository } from './base.repository';

export class AccountTransferRepository extends BaseRepository<AccountTransferRecord> {
  constructor(database: FinanceAssistantDatabase = db) {
    super(database.transfers, accountTransferSchema, {
      dateField: 'date',
      descriptionField: 'description',
      searchableFields: ['description', 'sourceAccountId', 'destinationAccountId', 'module', 'id'],
    });
  }

  async findByModule(module: FinancialModule, includeDeleted = false): Promise<AccountTransferRecord[]> {
    return (await this.findAll({ includeDeleted })).filter((transfer) => transfer.module === module);
  }
}

export const accountTransferRepository = new AccountTransferRepository();