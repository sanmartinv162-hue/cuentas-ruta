import { db, type FinanceAssistantDatabase } from '../database/db';
import { settingsSchema } from '../models/settings';
import type { SettingsRecord } from '../types/database';
import { BaseRepository, RepositoryError } from './base.repository';

export class SettingsRepository extends BaseRepository<SettingsRecord> {
  constructor(database: FinanceAssistantDatabase = db) {
    super(database.settings, settingsSchema, {
      dateField: 'updatedAt',
      searchableFields: ['id', 'currency', 'theme'],
    });
  }

  override async create(record: SettingsRecord): Promise<SettingsRecord> {
    const current = await this.findById('global', true);
    if (current) throw new RepositoryError('CONFLICT', 'La configuración singleton ya existe. Usa update o restore.');
    return super.create(record);
  }
}

export const settingsRepository = new SettingsRepository();
