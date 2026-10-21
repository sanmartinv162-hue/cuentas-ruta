import Dexie, { type EntityTable } from 'dexie';
import { migrateV1ToV2, migrateV3ToV4 } from './migrations';
import { CURRENT_DATABASE_VERSION, DATABASE_NAME, schemaV1, schemaV2, schemaV3, schemaV4, schemaV5 } from './schema';
import type {
  BusinessMovementRecord,
  AccountTransferRecord,
  CapitalRecord,
  ClassificationRuleRecord,
  DailyGoalRecord,
  DatabaseMetadataRecord,
  JourneyRecord,
  PersonalMovementRecord,
  SavingRecord,
  SettingsRecord,
  FinancialAccountRecord,
} from '../types/database';

/** Instancia tipada única de IndexedDB para los datos del dominio financiero. */
export class FinanceAssistantDatabase extends Dexie {
  settings!: EntityTable<SettingsRecord, 'id'>;
  personalMovements!: EntityTable<PersonalMovementRecord, 'id'>;
  businessMovements!: EntityTable<BusinessMovementRecord, 'id'>;
  journeys!: EntityTable<JourneyRecord, 'id'>;
  savings!: EntityTable<SavingRecord, 'id'>;
  capital!: EntityTable<CapitalRecord, 'id'>;
  dailyGoals!: EntityTable<DailyGoalRecord, 'id'>;
  classificationRules!: EntityTable<ClassificationRuleRecord, 'id'>;
  metadata!: EntityTable<DatabaseMetadataRecord, 'key'>;
  accounts!: EntityTable<FinancialAccountRecord, 'id'>;
  transfers!: EntityTable<AccountTransferRecord, 'id'>;

  constructor(databaseName = DATABASE_NAME) {
    super(databaseName);
    this.version(1).stores(schemaV1);
    this.version(2).stores(schemaV2).upgrade(migrateV1ToV2);
    this.version(3).stores(schemaV3);
    this.version(4).stores(schemaV4).upgrade(migrateV3ToV4);
    this.version(CURRENT_DATABASE_VERSION).stores(schemaV5);
  }
}

export const db = new FinanceAssistantDatabase();

/** Abre la base y convierte errores técnicos en un mensaje de dominio estable. */
export async function openFinanceAssistantDatabase(): Promise<FinanceAssistantDatabase> {
  try {
    await db.open();
    return db;
  } catch (cause) {
    throw new Error('No se pudo abrir FinanceAssistantDB.', { cause });
  }
}
