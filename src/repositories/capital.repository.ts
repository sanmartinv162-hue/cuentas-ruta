import { db, type FinanceAssistantDatabase } from '../database/db';
import { capitalSchema } from '../models/capital';
import type { CapitalRecord } from '../types/database';
import { logger } from '../utils/logger';
import { BaseRepository, RepositoryError } from './base.repository';

export class CapitalRepository extends BaseRepository<CapitalRecord> {
  constructor(database: FinanceAssistantDatabase = db) {
    super(database.capital, capitalSchema, {
      dateField: 'updatedAt',
      searchableFields: ['id', 'updatedAt'],
    });
  }

  override async create(record: CapitalRecord): Promise<CapitalRecord> {
    return this.saveCalculated(record);
  }

  override async update(_id: string, _changes: Partial<CapitalRecord>): Promise<CapitalRecord> {
    throw new RepositoryError('READ_ONLY', 'El capital solo puede actualizarse mediante un cálculo de dominio.');
  }

  override async delete(_id: string): Promise<CapitalRecord> {
    throw new RepositoryError('READ_ONLY', 'El capital calculado no se puede eliminar manualmente.');
  }

  override async restore(_id: string): Promise<CapitalRecord> {
    throw new RepositoryError('READ_ONLY', 'El capital calculado no admite restauración manual.');
  }

  async saveCalculated(record: CapitalRecord): Promise<CapitalRecord> {
    const calculated = this.parse({ ...record, id: 'current' });
    try {
      await this.table.put(calculated);
      logger.info('repository.capital.recalculated');
      return calculated;
    } catch (cause) {
      logger.error('repository.capital.recalculationFailed', cause);
      throw new RepositoryError('DATABASE', 'No se pudo guardar el capital calculado.', { cause });
    }
  }
}

export const capitalRepository = new CapitalRepository();
