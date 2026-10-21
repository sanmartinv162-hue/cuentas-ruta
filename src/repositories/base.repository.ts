import type { InsertType, Table } from 'dexie';
import type { SoftDeletableRecord } from '../types/database';
import { logger } from '../utils/logger';

export type RepositoryErrorCode = 'VALIDATION' | 'NOT_FOUND' | 'CONFLICT' | 'DATABASE' | 'READ_ONLY';

export class RepositoryError extends Error {
  constructor(readonly code: RepositoryErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'RepositoryError';
  }
}

export interface SafeValidator<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false; error: unknown };
}

export interface SearchOptions {
  query?: string;
  type?: string;
  paymentMethod?: string;
  category?: string;
  journeyId?: string;
  startDate?: string;
  endDate?: string;
  includeDeleted?: boolean;
}

interface RepositoryOptions<T> {
  dateField: keyof T & string;
  descriptionField?: keyof T & string;
  searchableFields?: (keyof T & string)[];
}

function readField(record: object, field: string): unknown {
  return (record as Record<string, unknown>)[field];
}

function includesQuery(value: unknown, query: string): boolean {
  return typeof value === 'string' && value.toLocaleLowerCase().includes(query);
}

/** Common indexed CRUD and soft-delete behavior for domain repositories. */
export abstract class BaseRepository<T extends SoftDeletableRecord> {
  protected constructor(
    protected readonly table: Table<T, T['id'], InsertType<T, 'id'>>,
    private readonly validator: SafeValidator<T>,
    private readonly options: RepositoryOptions<T>,
  ) {}

  async create(record: T): Promise<T> {
    const parsed = this.parse(record);
    return this.execute('create', async () => {
      await this.table.add(parsed);
      return parsed;
    });
  }

  async update(id: string, changes: Partial<T>): Promise<T> {
    return this.execute('update', async () => {
      const current = await this.table.get(id);
      if (!current || current.deletedAt) throw new RepositoryError('NOT_FOUND', 'El registro no existe o está eliminado.');
      const updated = this.withUpdateMetadata({ ...current, ...changes, id, deletedAt: null } as T);
      const parsed = this.parse(updated);
      await this.table.put(parsed);
      return parsed;
    }, { id });
  }

  async delete(id: string): Promise<T> {
    return this.execute('softDelete', async () => {
      const current = await this.table.get(id);
      if (!current || current.deletedAt) throw new RepositoryError('NOT_FOUND', 'El registro no existe o ya está eliminado.');
      const now = new Date().toISOString();
      const deleted = this.withUpdateMetadata({ ...current, deletedAt: now } as T);
      const parsed = this.parse(deleted);
      await this.table.put(parsed);
      return parsed;
    }, { id });
  }

  async restore(id: string): Promise<T> {
    return this.execute('restore', async () => {
      const current = await this.table.get(id);
      if (!current || !current.deletedAt) throw new RepositoryError('NOT_FOUND', 'No se encontró un registro eliminado para restaurar.');
      const restored = this.withUpdateMetadata({ ...current, deletedAt: null } as T);
      const parsed = this.parse(restored);
      await this.table.put(parsed);
      return parsed;
    }, { id });
  }

  async findById(id: string, includeDeleted = false): Promise<T | null> {
    return this.execute('findById', async () => {
      const record = await this.table.get(id);
      return record && (includeDeleted || !record.deletedAt) ? record : null;
    }, { id });
  }

  async findAll(options: { includeDeleted?: boolean } = {}): Promise<T[]> {
    return this.execute('findAll', async () => {
      const records = await this.table.toArray();
      return records.filter((record) => options.includeDeleted || !record.deletedAt).sort((left, right) => {
        const leftDate = readField(left, this.options.dateField);
        const rightDate = readField(right, this.options.dateField);
        return String(rightDate ?? '').localeCompare(String(leftDate ?? ''));
      });
    });
  }

  async findByDate(date: string, options: { includeDeleted?: boolean } = {}): Promise<T[]> {
    return this.execute('findByDate', async () => {
      const day = date.slice(0, 10);
      const matches = await this.table.where(this.options.dateField).startsWith(day).toArray();
      return matches.filter((record) => options.includeDeleted || !record.deletedAt);
    }, { date });
  }

  async findBetweenDates(startDate: string, endDate: string, options: { includeDeleted?: boolean } = {}): Promise<T[]> {
    return this.execute('findBetweenDates', async () => {
      if (startDate > endDate) throw new RepositoryError('VALIDATION', 'La fecha inicial debe ser anterior a la fecha final.');
      const matches = await this.table.where(this.options.dateField).between(startDate, endDate, true, true).toArray();
      return matches.filter((record) => options.includeDeleted || !record.deletedAt);
    }, { startDate, endDate });
  }

  async findByDescription(description: string, options: { includeDeleted?: boolean } = {}): Promise<T[]> {
    return this.execute('findByDescription', async () => {
      const field = this.options.descriptionField;
      const query = description.trim();
      if (!query) return [];
      if (!field) return this.search({ query, includeDeleted: options.includeDeleted });
      const matches = await this.table.where(field).startsWithIgnoreCase(query).toArray();
      return matches.filter((record) => options.includeDeleted || !record.deletedAt);
    });
  }

  async search(options: SearchOptions = {}): Promise<T[]> {
    return this.execute('search', async () => {
      let records = options.startDate && options.endDate
        ? await this.findBetweenDates(options.startDate, options.endDate, { includeDeleted: options.includeDeleted })
        : await this.findAll({ includeDeleted: options.includeDeleted });
      if (options.type) records = records.filter((record) => readField(record, 'type') === options.type);
      if (options.paymentMethod) records = records.filter((record) => readField(record, 'paymentMethod') === options.paymentMethod);
      if (options.category) records = records.filter((record) => readField(record, 'detectedCategory') === options.category);
      if (options.journeyId) records = records.filter((record) => readField(record, 'journeyId') === options.journeyId);
      const query = options.query?.trim().toLocaleLowerCase();
      if (query) {
        const fields = this.options.searchableFields ?? [this.options.descriptionField, 'id' as keyof T & string].filter((field): field is keyof T & string => Boolean(field));
        records = records.filter((record) => fields.some((field) => includesQuery(readField(record, field), query)));
      }
      return records;
    });
  }

  async count(options: { includeDeleted?: boolean } = {}): Promise<number> {
    return this.execute('count', async () => {
      if (options.includeDeleted) return this.table.count();
      return this.table.filter((record) => !record.deletedAt).count();
    });
  }

  protected parse(record: unknown): T {
    const result = this.validator.safeParse(record);
    if (!result.success) throw new RepositoryError('VALIDATION', 'El registro no cumple el modelo de datos.', { cause: result.error });
    return result.data;
  }

  private withUpdateMetadata(record: T): T {
    const value = record as T & { updatedAt?: string; version?: number; synced?: boolean; syncVersion?: number };
    const updated = { ...value };
    if ('updatedAt' in value) updated.updatedAt = new Date().toISOString();
    if (typeof value.version === 'number') {
      updated.version = value.version + 1;
      updated.synced = false;
      updated.syncVersion = (typeof value.syncVersion === 'number' ? value.syncVersion : 0) + 1;
    }
    return updated;
  }

  private async execute<R>(operation: string, action: () => Promise<R>, context?: Readonly<Record<string, unknown>>): Promise<R> {
    try {
      const result = await action();
      logger.info(`repository.${operation}`, context);
      return result;
    } catch (cause) {
      if (cause instanceof RepositoryError) throw cause;
      if (cause instanceof Error && cause.name === 'ConstraintError') {
        logger.warn(`repository.${operation}.conflict`, context);
        throw new RepositoryError('CONFLICT', 'Ya existe un registro con ese identificador.', { cause });
      }
      logger.error(`repository.${operation}.failed`, cause, context);
      throw new RepositoryError('DATABASE', 'No se pudo completar la operación en IndexedDB.', { cause });
    }
  }
}
