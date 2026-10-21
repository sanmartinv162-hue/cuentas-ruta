import { db, type FinanceAssistantDatabase } from '../database/db';
import { savingSchema } from '../models/saving';
import type { SavingRecord } from '../types/database';
import { BaseRepository } from './base.repository';

export class SavingRepository extends BaseRepository<SavingRecord> {
  constructor(database: FinanceAssistantDatabase = db) {
    super(database.savings, savingSchema, {
      dateField: 'date',
      descriptionField: 'description',
      searchableFields: ['description', 'type', 'date', 'id'],
    });
  }
}

export const savingRepository = new SavingRepository();
