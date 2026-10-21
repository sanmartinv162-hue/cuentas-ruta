import { v4 as uuid } from 'uuid';
import { db, type FinanceAssistantDatabase } from '../database/db';
import { logger } from './logger';

export interface IdentityProvider {
  createId(): string;
  getDeviceId(): Promise<string>;
}

export class DatabaseIdentityProvider implements IdentityProvider {
  private deviceId: string | null = null;

  constructor(private readonly database: FinanceAssistantDatabase = db) {}

  createId(): string {
    return uuid();
  }

  async getDeviceId(): Promise<string> {
    if (this.deviceId) return this.deviceId;
    try {
      const record = await this.database.metadata.get('deviceId');
      if (record?.value) {
        this.deviceId = record.value;
        return record.value;
      }
      const id = this.createId();
      try {
        await this.database.metadata.add({ key: 'deviceId', value: id });
        this.deviceId = id;
        return id;
      } catch {
        const winner = await this.database.metadata.get('deviceId');
        if (winner?.value) {
          this.deviceId = winner.value;
          return winner.value;
        }
        throw new Error('No se pudo persistir la identidad del dispositivo.');
      }
    } catch (cause) {
      logger.error('identity.deviceId.failed', cause);
      throw new Error('No se pudo resolver la identidad del dispositivo.', { cause });
    }
  }
}

export const identityProvider = new DatabaseIdentityProvider();
