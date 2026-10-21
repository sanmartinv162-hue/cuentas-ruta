import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { v4 as uuid } from 'uuid';
import { FinanceAssistantDatabase } from '../database/db';
import { FinancialAccountRepository } from '../repositories/account.repository';
import { AccountTransferRepository } from '../repositories/account-transfer.repository';
import { BusinessMovementRepository } from '../repositories/business.repository';
import { FinanceUnitOfWorkRepository } from '../repositories/finance-unit-of-work.repository';
import { JourneyRepository } from '../repositories/journey.repository';
import { PersonalMovementRepository } from '../repositories/personal.repository';
import { SavingRepository } from '../repositories/saving.repository';
import { SettingsRepository } from '../repositories/settings.repository';
import { FinancialAccountService } from '../services/financialAccount.service';
import { LegacyDataService } from '../services/legacyData.service';
import type { AppData } from '../types';
import type { IdentityProvider } from '../utils/identity';

let database: FinanceAssistantDatabase;
let importer: LegacyDataService;
let data: AppData;

beforeEach(async () => {
  database = new FinanceAssistantDatabase(`LegacyImportTests-${uuid()}`);
  await database.open();
  const identity: IdentityProvider = { createId: uuid, getDeviceId: async () => 'legacy-import-test' };
  const personal = new PersonalMovementRepository(database);
  const business = new BusinessMovementRepository(database);
  const transfers = new AccountTransferRepository(database);
  const settings = new SettingsRepository(database);
  const accounts = new FinancialAccountService(
    new FinancialAccountRepository(database), personal, business, transfers,
    new SavingRepository(database), settings, identity, () => new Date('2026-10-20T18:00:00.000Z'), new JourneyRepository(database),
  );
  importer = new LegacyDataService(new FinanceUnitOfWorkRepository(database), accounts, identity, () => new Date('2026-10-20T18:00:00.000Z'));
  const journeyId = uuid();
  data = {
    schemaVersion: 1,
    movements: [
      { id: uuid(), space: 'personal', kind: 'income', amountCOP: 20_000, description: 'Venta', occurredAt: '2026-10-20T09:00:00.000Z', paymentMethod: 'Nequi', category: '', deliveryCount: 0, workdayId: null },
      { id: uuid(), space: 'deliveries', kind: 'income', amountCOP: 15_000, description: 'Domicilio', occurredAt: '2026-10-20T10:00:00.000Z', paymentMethod: 'Efectivo', category: '', deliveryCount: 1, workdayId: journeyId },
    ],
    workdays: [{ id: journeyId, startedAt: '2026-10-20T08:00:00.000Z', initialCapitalCOP: 5_000, endedAt: '2026-10-20T11:00:00.000Z', savingsTransferredCOP: 2_000 }],
    savings: [{ id: uuid(), kind: 'deposit', amountCOP: 2_000, occurredAt: '2026-10-20T11:00:00.000Z', note: 'Ahorro diario' }],
    settings: {
      dailyGoalCOP: 100_000, startingCapitalCOP: 5_000, paymentMethods: ['Nequi', 'Efectivo'], currency: 'COP',
      theme: 'system', learnedCategories: { personal: { zapatos: 'Compras' }, deliveries: { primax: 'Gasolina' } },
    },
  };
});

afterEach(async () => {
  database.close();
  await database.delete();
});

describe('importación de la base anterior', () => {
  it('copia movimientos, jornadas y ahorro conservando IDs y no sobrescribe al repetir', async () => {
    expect(await importer.import(data)).toMatchObject({ ok: true, value: true });
    expect(await importer.import(data)).toMatchObject({ ok: true, value: false });
    expect(await database.personalMovements.get(data.movements[0].id)).toMatchObject({ amount: 20_000, paymentMethod: 'Nequi' });
    expect(await database.businessMovements.get(data.movements[1].id)).toMatchObject({ amount: 15_000, journeyId: data.workdays[0].id, paymentMethod: 'Efectivo' });
    expect(await database.journeys.get(data.workdays[0].id)).toMatchObject({ initialCapital: 5_000, income: 15_000, savingTransferred: 2_000, status: 'closed' });
    expect(await database.savings.get(data.savings[0].id)).toMatchObject({ amount: 2_000, description: 'Ahorro diario', balanceAfter: 2_000 });
    expect(await database.accounts.where('module').equals('personal').count()).toBe(2);
    expect(await database.accounts.where('module').equals('business').count()).toBe(2);
  });
});

describe('integridad al restaurar respaldos', () => {
  it('consolida cuentas duplicadas, conserva capital y reconstruye jornada ausente', async () => {
    const danglingJourneyId = uuid();
    data.workdays = [];
    data.movements[1].workdayId = danglingJourneyId;
    data.accountBalances = {
      personal: { total: 20_000, accounts: [
        { id: uuid(), name: 'Efectivo', balance: 0 }, { id: uuid(), name: ' efectivo ', balance: 0 },
        { id: uuid(), name: 'Nequi', balance: 10_000 }, { id: uuid(), name: 'NEQUI', balance: 10_000 },
      ] },
      deliveries: { total: 18_000, accounts: [
        { id: uuid(), name: 'Efectivo', balance: 9_000 }, { id: uuid(), name: 'EFECTIVO', balance: 9_000 },
        { id: uuid(), name: 'Nequi', balance: 0 }, { id: uuid(), name: 'nequi', balance: 0 },
      ] },
    };
    expect(await importer.import(data, true)).toMatchObject({ ok: true, value: true });
    expect(await database.accounts.where('module').equals('personal').count()).toBe(2);
    expect(await database.accounts.where('module').equals('business').count()).toBe(2);
    const movement = await database.businessMovements.get(data.movements[1].id);
    expect(movement?.journeyId).toBe(danglingJourneyId);
    expect(await database.journeys.get(movement!.journeyId)).toBeDefined();
  });

  it('rechaza capital de respaldo inconsistente antes de reemplazar datos', async () => {
    data.accountBalances = {
      personal: { total: 999_999, accounts: [{ id: uuid(), name: 'Nequi', balance: 999_999 }] },
      deliveries: { total: 18_000, accounts: [{ id: uuid(), name: 'Efectivo', balance: 18_000 }] },
    };
    const result = await importer.import(data, true);
    expect(result).toMatchObject({ ok: false });
    expect(await database.personalMovements.count()).toBe(0);
  });
});
