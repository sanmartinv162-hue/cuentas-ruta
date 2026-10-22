import { db, type FinanceAssistantDatabase } from '../database/db';
import type { AccountTransferRecord, BusinessMovementRecord, CapitalRecord, ClassificationRuleRecord, DailyGoalRecord, FinancialAccountRecord, FinancialModule, JourneyRecord, PersonalMovementRecord, SavingRecord, SettingsRecord } from '../types/database';

export interface LegacyImportBatch {
  settings: SettingsRecord;
  accounts: FinancialAccountRecord[];
  personalMovements: PersonalMovementRecord[];
  businessMovements: BusinessMovementRecord[];
  journeys: JourneyRecord[];
  savings: SavingRecord[];
  classificationRules: ClassificationRuleRecord[];
  transfers?: AccountTransferRecord[];
  capital?: CapitalRecord;
  dailyGoal?: DailyGoalRecord;
}

export interface SavingsUnitOfWork {
  savings(): Promise<SavingRecord[]>;
  journeys(): Promise<JourneyRecord[]>;
  businessAccounts(): Promise<FinancialAccountRecord[]>;
  personalMovements(): Promise<PersonalMovementRecord[]>;
  businessMovements(): Promise<BusinessMovementRecord[]>;
  transfers(): Promise<AccountTransferRecord[]>;
  settings(): Promise<SettingsRecord | undefined>;
  addSaving(record: SavingRecord): Promise<void>;
  putSaving(record: SavingRecord): Promise<void>;
  softDeleteSaving(id: string, deletedAt: string): Promise<SavingRecord>;
  restoreSaving(id: string, updatedAt: string): Promise<SavingRecord>;
  setBusinessSaving(balance: number, updatedAt: string): Promise<void>;
}

export interface JourneyCloseUnitOfWork extends SavingsUnitOfWork {
  activeJourneys(): Promise<JourneyRecord[]>;
  movementsForJourney(journeyId: string): Promise<BusinessMovementRecord[]>;
  accounts(): Promise<FinancialAccountRecord[]>;
  transfers(): Promise<AccountTransferRecord[]>;
  currentSettings(): Promise<SettingsRecord | undefined>;
  closeJourney(record: JourneyRecord): Promise<void>;
}

export interface AccountTransferUnitOfWork {
  accounts(module: FinancialModule): Promise<FinancialAccountRecord[]>;
  personalMovements(): Promise<PersonalMovementRecord[]>;
  businessMovements(): Promise<BusinessMovementRecord[]>;
  journeys(): Promise<JourneyRecord[]>;
  savings(): Promise<SavingRecord[]>;
  transfers(module: FinancialModule): Promise<AccountTransferRecord[]>;
  transfer(id: string): Promise<AccountTransferRecord | undefined>;
  addTransfer(record: AccountTransferRecord): Promise<void>;
  deleteTransfer(id: string, timestamp: string): Promise<AccountTransferRecord>;
  restoreTransfer(id: string, timestamp: string): Promise<AccountTransferRecord>;
  settings(): Promise<SettingsRecord | undefined>;
}

/** Owns multi-table transactions so services never touch Dexie tables directly. */
export class FinanceUnitOfWorkRepository {
  constructor(private readonly database: FinanceAssistantDatabase = db) {}

  withSavingsTransaction<T>(work: (unit: SavingsUnitOfWork) => Promise<T>): Promise<T> {
    return this.database.transaction('rw', [this.database.savings, this.database.settings, this.database.accounts, this.database.personalMovements, this.database.businessMovements, this.database.transfers, this.database.journeys], async () => {
      return work(this.savingsUnit());
    });
  }

  withJourneyCloseTransaction<T>(work: (unit: JourneyCloseUnitOfWork) => Promise<T>): Promise<T> {
    return this.database.transaction(
      'rw', [this.database.journeys, this.database.businessMovements, this.database.savings, this.database.settings, this.database.accounts, this.database.transfers],
      async () => work({
        ...this.savingsUnit(),
        activeJourneys: async () => (await this.database.journeys.where('status').equals('active').toArray()).filter((journey) => !journey.deletedAt),
        movementsForJourney: async (journeyId) => (await this.database.businessMovements.where('journeyId').equals(journeyId).toArray()).filter((movement) => !movement.deletedAt),
        accounts: async () => (await this.database.accounts.where('module').equals('business').toArray()).filter((account) => !account.deletedAt),
        transfers: async () => (await this.database.transfers.where('module').equals('business').toArray()).filter((transfer) => !transfer.deletedAt),
        currentSettings: () => this.database.settings.get('global'),
        closeJourney: async (record) => { await this.database.journeys.put(record); },
      }),
    );
  }

  withAccountTransferTransaction<T>(work: (unit: AccountTransferUnitOfWork) => Promise<T>): Promise<T> {
    return this.database.transaction(
      'rw', [this.database.accounts, this.database.transfers, this.database.personalMovements,
        this.database.businessMovements, this.database.journeys, this.database.savings, this.database.settings],
      async () => work({
        accounts: async (module) => (await this.database.accounts.where('module').equals(module).toArray()).filter((account) => !account.deletedAt),
        personalMovements: async () => (await this.database.personalMovements.toArray()).filter((movement) => !movement.deletedAt),
        businessMovements: async () => (await this.database.businessMovements.toArray()).filter((movement) => !movement.deletedAt),
        journeys: async () => (await this.database.journeys.toArray()).filter((journey) => !journey.deletedAt),
        savings: async () => (await this.database.savings.toArray()).filter((saving) => !saving.deletedAt),
        transfers: async () => (await this.database.transfers.toArray()).filter((transfer) => !transfer.deletedAt),
        transfer: (id) => this.database.transfers.get(id),
        addTransfer: async (record) => { await this.database.transfers.add(record); },
        deleteTransfer: async (id, timestamp) => {
          const current = await this.database.transfers.get(id);
          if (!current || current.deletedAt) throw new Error('No se encontró una transferencia activa.');
          const deleted = { ...current, deletedAt: timestamp, updatedAt: timestamp };
          await this.database.transfers.put(deleted);
          return deleted;
        },
        restoreTransfer: async (id, timestamp) => {
          const current = await this.database.transfers.get(id);
          if (!current || !current.deletedAt) throw new Error('No se encontró una transferencia eliminada.');
          const restored = { ...current, deletedAt: null, updatedAt: timestamp };
          await this.database.transfers.put(restored);
          return restored;
        },
        settings: () => this.database.settings.get('global'),
      }),
    );
  }

  importLegacyData(batch: LegacyImportBatch): Promise<boolean> {
    return this.database.transaction(
      'rw', [this.database.settings, this.database.accounts, this.database.personalMovements,
        this.database.businessMovements, this.database.journeys, this.database.savings,
        this.database.classificationRules, this.database.capital, this.database.dailyGoals, this.database.metadata],
      async () => {
        if (await this.database.metadata.get('legacy-import-v1')) return false;
        if (!await this.database.settings.get('global')) await this.database.settings.add(batch.settings);
        for (const account of batch.accounts) if (!await this.database.accounts.get(account.id)) await this.database.accounts.add(account);
        for (const movement of batch.personalMovements) if (!await this.database.personalMovements.get(movement.id)) await this.database.personalMovements.add(movement);
        for (const movement of batch.businessMovements) if (!await this.database.businessMovements.get(movement.id)) await this.database.businessMovements.add(movement);
        for (const journey of batch.journeys) if (!await this.database.journeys.get(journey.id)) await this.database.journeys.add(journey);
        for (const saving of batch.savings) if (!await this.database.savings.get(saving.id)) await this.database.savings.add(saving);
        for (const rule of batch.classificationRules) if (!await this.database.classificationRules.get(rule.id)) await this.database.classificationRules.add(rule);
        if (batch.capital && !await this.database.capital.get(batch.capital.id)) await this.database.capital.add(batch.capital);
        if (batch.dailyGoal && !await this.database.dailyGoals.get(batch.dailyGoal.id)) await this.database.dailyGoals.add(batch.dailyGoal);
        await this.database.metadata.put({ key: 'legacy-import-v1', value: new Date().toISOString() });
        return true;
      },
    );
  }

  restoreBackup(batch: LegacyImportBatch): Promise<void> {
    return this.database.transaction(
      'rw', [this.database.settings, this.database.accounts, this.database.personalMovements,
        this.database.businessMovements, this.database.journeys, this.database.savings,
        this.database.classificationRules, this.database.transfers, this.database.capital,
        this.database.dailyGoals, this.database.metadata],
      async () => {
        await Promise.all([
          this.database.settings.clear(), this.database.accounts.clear(),
          this.database.personalMovements.clear(), this.database.businessMovements.clear(),
          this.database.journeys.clear(), this.database.savings.clear(),
          this.database.classificationRules.clear(), this.database.transfers.clear(),
          this.database.capital.clear(), this.database.dailyGoals.clear(),
        ]);
        await Promise.all([
          this.database.settings.put(batch.settings),
          batch.accounts.length ? this.database.accounts.bulkPut(batch.accounts) : Promise.resolve(),
          batch.personalMovements.length ? this.database.personalMovements.bulkPut(batch.personalMovements) : Promise.resolve(),
          batch.businessMovements.length ? this.database.businessMovements.bulkPut(batch.businessMovements) : Promise.resolve(),
          batch.journeys.length ? this.database.journeys.bulkPut(batch.journeys) : Promise.resolve(),
          batch.savings.length ? this.database.savings.bulkPut(batch.savings) : Promise.resolve(),
          batch.classificationRules.length ? this.database.classificationRules.bulkPut(batch.classificationRules) : Promise.resolve(),
          batch.transfers?.length ? this.database.transfers.bulkPut(batch.transfers) : Promise.resolve(),
          this.database.metadata.put({ key: 'initialized', value: 'true' }),
          this.database.metadata.put({ key: 'legacy-import-v1', value: new Date().toISOString() }),
        ]);
      },
    );
  }

  clearTodayRecords(): Promise<void> {
    const timestamp = new Date().toISOString();
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const isToday = (value?: string | null) => Boolean(value && value >= dayStart && value < dayEnd);
    return this.database.transaction(
      'rw', [this.database.personalMovements, this.database.businessMovements,
        this.database.journeys, this.database.savings, this.database.transfers, this.database.dailyGoals],
      async () => {
        const [personalMovements, businessMovements, journeys, savings, transfers, dailyGoals] = await Promise.all([
          this.database.personalMovements.toArray(), this.database.businessMovements.toArray(),
          this.database.journeys.toArray(), this.database.savings.toArray(),
          this.database.transfers.toArray(), this.database.dailyGoals.toArray(),
        ]);
        const softDeleteToday = <T extends { createdAt: string; date: string; deletedAt?: string | null; updatedAt: string }>(records: T[]) =>
          records.filter((record) => !record.deletedAt && (isToday(record.createdAt) || isToday(record.date)))
            .map((record) => ({ ...record, deletedAt: timestamp, updatedAt: timestamp }));
        const softDeleteJourneys = journeys
          .filter((journey) => !journey.deletedAt && (isToday(journey.createdAt) || isToday(journey.startTime)))
          .map((journey) => ({ ...journey, deletedAt: timestamp, updatedAt: timestamp }));
        const softDeleteGoals = dailyGoals
          .filter((goal) => !goal.deletedAt && goal.date === todayKey)
          .map((goal) => ({ ...goal, deletedAt: timestamp }));
        const todayPersonalMovements = softDeleteToday(personalMovements);
        const todayBusinessMovements = softDeleteToday(businessMovements);
        const todaySavings = softDeleteToday(savings);
        const todayTransfers = softDeleteToday(transfers);
        const writes = [
          todayPersonalMovements.length ? this.database.personalMovements.bulkPut(todayPersonalMovements) : Promise.resolve(),
          todayBusinessMovements.length ? this.database.businessMovements.bulkPut(todayBusinessMovements) : Promise.resolve(),
          softDeleteJourneys.length ? this.database.journeys.bulkPut(softDeleteJourneys) : Promise.resolve(),
          todaySavings.length ? this.database.savings.bulkPut(todaySavings) : Promise.resolve(),
          todayTransfers.length ? this.database.transfers.bulkPut(todayTransfers) : Promise.resolve(),
          softDeleteGoals.length ? this.database.dailyGoals.bulkPut(softDeleteGoals) : Promise.resolve(),
        ];
        await Promise.all(writes);
      },
    );
  }

  private savingsUnit(): SavingsUnitOfWork {
    return {
      savings: async () => (await this.database.savings.toArray()).filter((saving) => !saving.deletedAt),
      journeys: async () => (await this.database.journeys.toArray()).filter((journey) => !journey.deletedAt),
      businessAccounts: async () => (await this.database.accounts.where('module').equals('business').toArray()).filter((account) => !account.deletedAt),
      personalMovements: async () => (await this.database.personalMovements.toArray()).filter((movement) => !movement.deletedAt),
      businessMovements: async () => (await this.database.businessMovements.toArray()).filter((movement) => !movement.deletedAt),
      transfers: async () => (await this.database.transfers.where('module').equals('business').toArray()).filter((transfer) => !transfer.deletedAt),
      settings: () => this.database.settings.get('global'),
      addSaving: async (record) => { await this.database.savings.add(record); },
      putSaving: async (record) => { await this.database.savings.put(record); },
      softDeleteSaving: async (id, deletedAt) => {
        const current = await this.database.savings.get(id);
        if (!current || current.deletedAt) throw new Error('No se encontró el movimiento de ahorro activo.');
        const deleted = { ...current, deletedAt, updatedAt: deletedAt };
        await this.database.savings.put(deleted);
        return deleted;
      },
      restoreSaving: async (id, updatedAt) => {
        const current = await this.database.savings.get(id);
        if (!current || !current.deletedAt) throw new Error('No se encontró el movimiento de ahorro eliminado.');
        const restored = { ...current, deletedAt: null, updatedAt };
        await this.database.savings.put(restored);
        return restored;
      },
      setBusinessSaving: async (balance, updatedAt) => {
        const current = await this.database.settings.get('global');
        if (current) {
          await this.database.settings.put({ ...current, businessSaving: balance, updatedAt });
        } else {
          const defaults: SettingsRecord = {
            id: 'global', dailyGoal: 100_000, currency: 'COP', theme: 'system',
              businessInitialCapital: 0, businessSaving: balance,
            createdAt: updatedAt, updatedAt, deletedAt: null,
          };
          await this.database.settings.add(defaults);
        }
      },
    };
  }
}

export const financeUnitOfWorkRepository = new FinanceUnitOfWorkRepository();
