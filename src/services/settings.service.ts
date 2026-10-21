import { settingsSchema } from '../models/settings';
import type { SettingsRecord, ThemePreference } from '../types/database';
import { settingsRepository, type SettingsRepository } from '../repositories/settings.repository';
import { executeService, type ServiceResult } from './serviceResult';

export type SettingsChanges = Partial<Omit<SettingsRecord, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>>;

export class SettingsService {
  constructor(private readonly repository: SettingsRepository = settingsRepository, private readonly now: () => Date = () => new Date()) {}

  get(): Promise<ServiceResult<SettingsRecord>> {
    return executeService('settings.get', async () => this.getOrCreate());
  }

  update(changes: SettingsChanges): Promise<ServiceResult<SettingsRecord>> {
    return executeService('settings.update', async () => {
      const current = await this.getOrCreate();
      const candidate = settingsSchema.parse({ ...current, ...changes, id: 'global', updatedAt: this.now().toISOString() });
      return this.repository.update('global', candidate);
    });
  }

  setDailyGoal(dailyGoal: number): Promise<ServiceResult<SettingsRecord>> {
    return this.update({ dailyGoal });
  }

  setTheme(theme: ThemePreference): Promise<ServiceResult<SettingsRecord>> {
    return this.update({ theme });
  }

  private async getOrCreate(): Promise<SettingsRecord> {
    const existing = await this.repository.findById('global', true);
    if (existing) return existing.deletedAt ? this.repository.restore('global') : existing;
    const timestamp = this.now().toISOString();
    const defaults: SettingsRecord = {
      id: 'global', dailyGoal: 100_000, currency: 'COP', theme: 'system',
      businessInitialCapital: 0, businessSaving: 0, createdAt: timestamp, updatedAt: timestamp, deletedAt: null,
    };
    try {
      return await this.repository.create(defaults);
    } catch (cause) {
      const createdByConcurrentCall = await this.repository.findById('global');
      if (createdByConcurrentCall) return createdByConcurrentCall;
      throw cause;
    }
  }
}

export const settingsService = new SettingsService();
